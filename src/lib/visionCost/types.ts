export type VisionCostOperation =
  | "photoToColoring"
  | "correctPhotoColoring"
  | "photoToPortrait"
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

export type VisionErrorKind =
  | "billing"
  | "quota"
  | "auth"
  | "safety"
  | "other";

/** A failed vision API call (billing, quota, auth, safety block, …). */
export type VisionErrorEvent = {
  id: string;
  at: string;
  operation: VisionCostOperation;
  modelId: string;
  kind: VisionErrorKind;
  httpStatus: number | null;
  message: string;
};

export type VisionCostSessionSnapshot = {
  sessionId: string;
  startedAt: string;
  ratesFetchedAt: string | null;
  ratesSource: string | null;
  modelRates: ModelRateSnapshot[];
  events: VisionUsageEvent[];
  errors: VisionErrorEvent[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    inputCostUsd: number;
    outputCostUsd: number;
    totalCostUsd: number;
    callCount: number;
    errorCount: number;
  };
  logFilePath: string;
};
