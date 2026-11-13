import { layoutRatio } from "@/lib/photo/orientation";
import { recordVisionError, recordVisionUsage } from "@/lib/visionCost/session";
import type { ImageGenerator, ImagePurpose, ImageRequest, ImageResult } from "@/lib/ai/image/types";

const API_BASE = "https://api.openai.com/v1";
const REQUEST_TIMEOUT_MS = 150_000;
const MAX_ATTEMPTS = 3;

type Quality = "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export function openaiImageModelId(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-flare";
}

function quality(): Quality {
  const raw = process.env.OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
  const allowed: Quality[] = ["low", "medium", "high", "xhigh", "max", "auto"];
  return allowed.includes(raw as Quality) ? (raw as Quality) : "medium";
}

function edgeFromEnv(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(3840, Math.max(1024, raw));
}

/**
 * Long edge of the output in pixels.
 * - Photos (portrait versions) print as-is: 2400 matches Gemini's 2K
 *   (1792×2400 on a 3:4 page, about 218 DPI on US Letter). OPENAI_IMAGE_LONG_EDGE.
 * - Coloring sheets are resampled to 2048 by the line-art step, so drawing
 *   them bigger only adds time and cost. OPENAI_SHEET_LONG_EDGE.
 */
function longEdge(purpose: ImagePurpose): number {
  return purpose === "photo"
    ? edgeFromEnv("OPENAI_IMAGE_LONG_EDGE", 2400)
    : edgeFromEnv("OPENAI_SHEET_LONG_EDGE", 2048);
}

/** Exact output size for the layout's aspect ratio, in multiples of 16. */
export function openaiSizeFor(layout: ImageRequest["layout"], purpose: ImagePurpose): string {
  const ratio = layoutRatio(layout);
  const edge = longEdge(purpose);
  const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
  const width = round16(ratio >= 1 ? edge : edge * ratio);
  const height = round16(ratio >= 1 ? edge / ratio : edge);
  return `${width}x${height}`;
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OpenAI API key is not configured.");
  return key;
}

/** One prompt for the edits endpoint: name each input image, then the instruction. */
function composePrompt(request: ImageRequest): string {
  const lines: string[] = [];
  request.references.forEach((ref, index) => {
    lines.push(`Input image ${index + 1}: ${ref.caption}`);
  });
  if (lines.length > 0) lines.push("");
  lines.push(request.prompt);
  for (const note of request.followUps ?? []) {
    lines.push("", note);
  }
  return lines.join("\n");
}

function extensionFor(mediaType: string): string {
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("webp")) return "webp";
  return "jpg";
}

type OpenAIImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
    output_tokens_details?: { text_tokens?: number; image_tokens?: number };
  };
  error?: { message?: string; code?: string; type?: string };
};

class OpenAIImageError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOnce(request: ImageRequest, modelId: string): Promise<OpenAIImageResponse> {
  const prompt = composePrompt(request);
  const size = openaiSizeFor(request.layout, request.purpose);
  const headers = { authorization: `Bearer ${apiKey()}` };

  let response: Response;
  try {
    if (request.references.length > 0) {
      const form = new FormData();
      form.append("model", modelId);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("quality", quality());
      form.append("output_format", "png");
      form.append("n", "1");
      request.references.forEach((ref, index) => {
        const bytes = Buffer.from(ref.base64, "base64");
        form.append(
          "image[]",
          new Blob([new Uint8Array(bytes)], { type: ref.mediaType }),
          `input-${index + 1}.${extensionFor(ref.mediaType)}`,
        );
      });
      response = await fetch(`${API_BASE}/images/edits`, {
        method: "POST",
        headers,
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } else {
      response = await fetch(`${API_BASE}/images/generations`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          prompt,
          size,
          quality: quality(),
          output_format: "png",
          n: 1,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OpenAIImageError(`OpenAI image request failed: ${message}`, null, true);
  }

  const raw = await response.text();
  let payload: OpenAIImageResponse;
  try {
    payload = JSON.parse(raw) as OpenAIImageResponse;
  } catch {
    throw new OpenAIImageError(
      `OpenAI returned a non-JSON response (HTTP ${response.status}).`,
      response.status,
      response.status >= 500,
    );
  }

  if (!response.ok) {
    const message =
      payload.error?.message ?? `OpenAI image request failed (HTTP ${response.status}).`;
    const retryable = response.status === 429 || response.status >= 500;
    throw new OpenAIImageError(message, response.status, retryable);
  }
  return payload;
}

async function imageFrom(payload: OpenAIImageResponse): Promise<ImageResult> {
  const item = payload.data?.[0];
  if (item?.b64_json) return { base64: item.b64_json, mediaType: "image/png" };
  if (item?.url) {
    const res = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
    if (res.ok) {
      const bytes = Buffer.from(await res.arrayBuffer());
      return {
        base64: bytes.toString("base64"),
        mediaType: res.headers.get("content-type") ?? "image/png",
      };
    }
  }
  throw new OpenAIImageError("No image was returned. Please try again.", null, true);
}

/** OpenAI GPT Image (Flare by default) through the Images API. */
export function createOpenAIImageGenerator(): ImageGenerator {
  const modelId = openaiImageModelId();

  return {
    vendor: "openai",
    modelId,
    async generate(request: ImageRequest): Promise<ImageResult> {
      let lastError: OpenAIImageError | null = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) await sleep(1000 * attempt);
        try {
          const payload = await callOnce(request, modelId);
          const image = await imageFrom(payload);
          const usage = payload.usage;
          try {
            await recordVisionUsage({
              operation: request.operation,
              modelId,
              inputTokens: usage?.input_tokens ?? 0,
              outputTokens: usage?.output_tokens ?? 0,
              hasImageOutput: true,
              imageInputTokens: usage?.input_tokens_details?.image_tokens ?? 0,
              imageOutputTokens: usage?.output_tokens_details?.image_tokens ?? usage?.output_tokens ?? 0,
              textOutputTokens: usage?.output_tokens_details?.text_tokens ?? 0,
            });
          } catch {
            /* cost logging must never break generation */
          }
          return image;
        } catch (error) {
          lastError =
            error instanceof OpenAIImageError
              ? error
              : new OpenAIImageError(error instanceof Error ? error.message : String(error), null, false);
          if (!lastError.retryable) break;
        }
      }

      const finalError = lastError ?? new OpenAIImageError("Could not generate an image.", null, false);
      try {
        await recordVisionError({
          operation: request.operation,
          modelId,
          error: finalError,
          httpStatus: finalError.status,
        });
      } catch {
        /* error logging must never mask the real failure */
      }
      throw new Error(finalError.message);
    },
  };
}
