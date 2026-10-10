import type { PhotoLayout } from "@/lib/photo/orientation";

type RestPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type RestAttempt = {
  imageSize?: "1K" | "2K";
  responseModalities?: Array<"TEXT" | "IMAGE">;
};

function apiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!key) {
    throw new Error("Google Generative AI API key is not configured.");
  }
  return key;
}

function modelId(): string {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseImageFromResponse(payload: unknown): { base64: string; mimeType: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown[] }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const parts = (candidate as { content?: { parts?: unknown[] } }).content?.parts;
    if (!Array.isArray(parts)) continue;

    const imageParts = parts.filter((part) => {
      if (!part || typeof part !== "object") return false;
      const record = part as Record<string, unknown>;
      return Boolean(record.inlineData ?? record.inline_data);
    });

    const chosen = imageParts.length > 0 ? imageParts[imageParts.length - 1] : null;
    if (!chosen || typeof chosen !== "object") continue;

    const record = chosen as Record<string, unknown>;
    const inline =
      (record.inlineData as { data?: string; mimeType?: string; mime_type?: string } | undefined) ??
      (record.inline_data as { data?: string; mime_type?: string; mimeType?: string } | undefined);
    const data = inline?.data;
    if (!data) continue;
    const mimeType =
      inline?.mimeType ?? inline?.mime_type ?? "image/png";
    return { base64: data, mimeType };
  }

  return null;
}

/**
 * Direct Gemini generateContent call — bypasses AI SDK JSON schema parsing, which
 * can fail with large multimodal image responses ("Invalid JSON response").
 */
export async function generateGeminiImageViaRest(
  parts: RestPart[],
  layout: PhotoLayout,
): Promise<{ base64: string; mediaType: string }> {
  const attempts: RestAttempt[] = [
    { imageSize: "1K" },
    { imageSize: "1K", responseModalities: ["IMAGE"] },
    {},
    { imageSize: "2K" },
  ];

  const safetySettings = [
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_LOW_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
  ];

  let lastError: unknown;

  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index];
    if (index > 0) {
      await sleep(400);
    }

    const imageConfig: { aspectRatio: string; imageSize?: string } = {
      aspectRatio: layout.aspectRatio,
    };
    if (attempt.imageSize) {
      imageConfig.imageSize = attempt.imageSize;
    }

    const body = {
      contents: [{ role: "user", parts }],
      safetySettings,
      generationConfig: {
        responseModalities: attempt.responseModalities ?? ["TEXT", "IMAGE"],
        imageConfig,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId())}:generateContent?key=${encodeURIComponent(apiKey())}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const raw = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(
          `Gemini returned a non-JSON response (HTTP ${response.status}).`,
        );
      }

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload &&
          "error" in payload &&
          typeof (payload as { error?: { message?: string } }).error?.message ===
            "string"
            ? (payload as { error: { message: string } }).error.message
            : `Gemini image request failed (HTTP ${response.status}).`;
        throw new Error(message);
      }

      const image = parseImageFromResponse(payload);
      if (image) {
        return { base64: image.base64, mediaType: image.mimeType };
      }

      throw new Error(
        "No coloring sheet image was returned. The photo may have been blocked — try another image.",
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not generate a coloring sheet. Please try again.");
}
