import { createGeminiImageGenerator } from "@/lib/ai/image/gemini";
import { createOpenAIImageGenerator } from "@/lib/ai/image/openai";
import type { ImageGenerator, ImageVendor } from "@/lib/ai/image/types";

export type { ImageGenerator, ImagePurpose, ImageReference, ImageRequest, ImageResult, ImageVendor } from "@/lib/ai/image/types";

/**
 * Which vendor draws images: IMAGE_PROVIDER=openai or gemini (default).
 * Text (the scene-plan chat and storybook writing) stays on Gemini either way.
 * If OpenAI is chosen but OPENAI_API_KEY is missing, Gemini is used instead so
 * a misconfigured deploy still works.
 */
export function configuredImageVendor(): ImageVendor {
  const raw = process.env.IMAGE_PROVIDER?.trim().toLowerCase();
  if (raw === "openai" && process.env.OPENAI_API_KEY?.trim()) return "openai";
  return "gemini";
}

export function createImageGenerator(vendor: ImageVendor = configuredImageVendor()): ImageGenerator {
  return vendor === "openai" ? createOpenAIImageGenerator() : createGeminiImageGenerator();
}
