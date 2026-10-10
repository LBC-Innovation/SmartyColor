import { generateText, type LanguageModelUsage } from "ai";
import type { LanguageModel } from "ai";
import {
  modelIdFromLanguageModel,
  recordVisionUsage,
} from "@/lib/visionCost/session";
import type { VisionCostOperation } from "@/lib/visionCost/types";

type GenerateTextParams = Parameters<typeof generateText>[0];

function usageNumbers(usage: LanguageModelUsage | undefined) {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  };
}

export async function trackVisionGenerateText(
  operation: VisionCostOperation,
  params: GenerateTextParams,
) {
  const result = await generateText(params);
  const hasImageOutput = result.files.some((file) =>
    file.mediaType.startsWith("image/"),
  );
  const { inputTokens, outputTokens } = usageNumbers(result.usage);
  const modelId = modelIdFromLanguageModel(params.model as LanguageModel);

  try {
    await recordVisionUsage({
      operation,
      modelId,
      inputTokens,
      outputTokens,
      hasImageOutput,
    });
  } catch {
    /* cost logging must never break generation */
  }

  return result;
}
