export type VisionCostOperation =
  | "photoToColoring"
  | "correctPhotoColoring"
  | "generateImage"
  | "refine"
  | "storybookPhotoChat"
  | "storybookGenerate";

export type ModelRateSnapshot = {
  modelId: string;
  inputUsdPerMTok: number;
  outputTextUsdPerMTok: number;
  outputImageUsdPerMTok: number | null;
  source: "google-pricing" | "fallback";
};

export type VisionUsageEvent = {
  id: string;
  at: string;
  operation: VisionCostOperation;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  hasImageOutput: boolean;
};

export type VisionCostSessionSnapshot = {
  sessionId: string;
  startedAt: string;
  ratesFetchedAt: string | null;
  ratesSource: string | null;
  modelRates: ModelRateSnapshot[];
  events: VisionUsageEvent[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    inputCostUsd: number;
    outputCostUsd: number;
    totalCostUsd: number;
    callCount: number;
  };
  logFilePath: string;
};
