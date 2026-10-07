import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createStubProvider } from "@/lib/ai/providers/stub";
import type { ColoringAI } from "@/lib/ai/types";

export function createColoringAI(): ColoringAI {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  const hasGeminiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

  if (provider === "stub" || !hasGeminiKey) {
    return createStubProvider();
  }

  if (provider === "gemini" || provider === "google") {
    return createGeminiProvider();
  }

  return createGeminiProvider();
}
