import { google } from "@ai-sdk/google";
import {
  generateGeminiImageViaRest,
  geminiImageAttempts,
  type GeminiImageAttempt,
} from "@/lib/ai/geminiImageGenerateRest";
import type { PhotoLayout } from "@/lib/photo/orientation";
import { trackVisionGenerateText } from "@/lib/visionCost/trackGenerateText";
import type { ImageGenerator, ImageRequest, ImageResult } from "@/lib/ai/image/types";

export const googleSafety = {
  google: {
    safetySettings: [
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT" as const,
        threshold: "BLOCK_LOW_AND_ABOVE" as const,
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT" as const,
        threshold: "BLOCK_MEDIUM_AND_ABOVE" as const,
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH" as const,
        threshold: "BLOCK_MEDIUM_AND_ABOVE" as const,
      },
      {
        category: "HARM_CATEGORY_HARASSMENT" as const,
        threshold: "BLOCK_MEDIUM_AND_ABOVE" as const,
      },
    ],
  },
};

type MessageContent = Array<
  | { type: "text"; text: string }
  | { type: "file"; data: string; mediaType: string }
>;

export function geminiImageModelId(): string {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
}

function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid json response|unable to process input image|invalid argument|internal error|resource exhausted|fetch failed|ECONNRESET|503|429|502|504/i.test(
    message,
  );
}

function buildImageProviderOptions(layout: PhotoLayout, options: GeminiImageAttempt = {}) {
  const imageConfig: { aspectRatio: PhotoLayout["aspectRatio"]; imageSize?: string } = {
    aspectRatio: layout.aspectRatio,
  };
  if (options.imageSize) {
    imageConfig.imageSize = options.imageSize;
  }
  return {
    ...googleSafety,
    google: {
      ...googleSafety.google,
      responseModalities: options.responseModalities ?? ["TEXT", "IMAGE"],
      imageConfig,
    },
  };
}

function pickImageFile(files: Array<{ base64: string; mediaType: string }>) {
  const imageFiles = files.filter((item) => item.mediaType.startsWith("image/"));
  return imageFiles.length > 0 ? imageFiles[imageFiles.length - 1] : undefined;
}

function toContent(request: ImageRequest): MessageContent {
  const content: MessageContent = [];
  for (const ref of request.references) {
    content.push({ type: "text", text: ref.caption });
    content.push({ type: "file", data: ref.base64, mediaType: ref.mediaType });
  }
  content.push({ type: "text", text: request.prompt });
  for (const note of request.followUps ?? []) {
    content.push({ type: "text", text: note });
  }
  return content;
}

function contentToRestParts(content: MessageContent) {
  return content.map((part) =>
    part.type === "text"
      ? { text: part.text }
      : { inlineData: { mimeType: part.mediaType, data: part.data } },
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gemini image generation: tries the print-quality size first and steps down
 * to smaller requests, then falls back to a direct REST call when the AI SDK
 * cannot parse a large multimodal response.
 */
export function createGeminiImageGenerator(): ImageGenerator {
  const modelId = geminiImageModelId();

  return {
    vendor: "gemini",
    modelId,
    async generate(request: ImageRequest): Promise<ImageResult> {
      const content = toContent(request);
      const attempts = geminiImageAttempts();

      let lastError: unknown;
      for (let index = 0; index < attempts.length; index++) {
        if (index > 0) await sleep(350);
        try {
          const result = await trackVisionGenerateText(request.operation, {
            model: google(modelId),
            messages: [{ role: "user", content }],
            providerOptions: buildImageProviderOptions(request.layout, attempts[index]),
            maxRetries: 2,
          });
          const file = pickImageFile(result.files);
          if (file) return file;
          throw new Error("No image file in model response.");
        } catch (error) {
          lastError = error;
          if (!isRetryableGeminiError(error)) break;
        }
      }

      try {
        return await generateGeminiImageViaRest(
          contentToRestParts(content),
          request.layout,
          request.operation,
        );
      } catch (restError) {
        if (lastError instanceof Error && isRetryableGeminiError(lastError)) {
          throw restError;
        }
        throw lastError instanceof Error ? lastError : restError;
      }
    },
  };
}
