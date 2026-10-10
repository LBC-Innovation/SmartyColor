import type { LanguageModel } from "ai";
import {
  costForUsage,
  fetchGoogleGeminiRatesForModels,
} from "@/lib/visionCost/rates";
import { appendVisionCostLogLine } from "@/lib/visionCost/log";
import { VISION_COST_LOG_FILE } from "@/lib/visionCost/paths";
import type {
  ModelRateSnapshot,
  VisionCostOperation,
  VisionCostSessionSnapshot,
  VisionUsageEvent,
} from "@/lib/visionCost/types";

type SessionState = {
  sessionId: string;
  startedAt: string;
  initPromise: Promise<void> | null;
  ratesFetchedAt: string | null;
  ratesSource: string | null;
  modelRates: Map<string, ModelRateSnapshot>;
  events: VisionUsageEvent[];
  totals: VisionCostSessionSnapshot["totals"];
};

const globalKey = "__smartyVisionCostSession__";

function getState(): SessionState {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: SessionState;
  };
  if (!g[globalKey]) {
    g[globalKey] = {
      sessionId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      initPromise: null,
      ratesFetchedAt: null,
      ratesSource: null,
      modelRates: new Map(),
      events: [],
      totals: {
        inputTokens: 0,
        outputTokens: 0,
        inputCostUsd: 0,
        outputCostUsd: 0,
        totalCostUsd: 0,
        callCount: 0,
      },
    };
  }
  return g[globalKey];
}

function configuredModelIds(): string[] {
  const refine =
    process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
  const image =
    process.env.GEMINI_IMAGE_MODEL?.trim() ||
    "gemini-3.1-flash-image-preview";
  return [refine, image];
}

async function writeSessionHeader(state: SessionState) {
  await appendVisionCostLogLine(
    `=== Vision API cost session ${state.sessionId} started ${state.startedAt} ===`,
  );
  if (state.ratesSource) {
    await appendVisionCostLogLine(`Rates source: ${state.ratesSource}`);
  }
  for (const rate of state.modelRates.values()) {
    await appendVisionCostLogLine(
      `Rate ${rate.modelId}: input=$${rate.inputUsdPerMTok}/MTok text_out=$${rate.outputTextUsdPerMTok}/MTok` +
        (rate.outputImageUsdPerMTok != null
          ? ` image_out=$${rate.outputImageUsdPerMTok}/MTok`
          : "") +
        ` (${rate.source})`,
    );
  }
}

export async function ensureVisionCostSession(): Promise<void> {
  const state = getState();
  if (state.ratesFetchedAt) return;
  if (state.initPromise) {
    await state.initPromise;
    return;
  }

  state.initPromise = (async () => {
    const { fetchedAt, source, rates } =
      await fetchGoogleGeminiRatesForModels(configuredModelIds());
    state.ratesFetchedAt = fetchedAt;
    state.ratesSource = source;
    for (const rate of rates) {
      state.modelRates.set(rate.modelId, rate);
    }
    await writeSessionHeader(state);
  })();

  try {
    await state.initPromise;
  } finally {
    state.initPromise = null;
  }
}

function rateForModel(modelId: string): ModelRateSnapshot {
  const state = getState();
  const direct = state.modelRates.get(modelId);
  if (direct) return direct;
  for (const [key, value] of state.modelRates) {
    if (modelId.startsWith(key) || key.startsWith(modelId)) return value;
  }
  return (
    state.modelRates.values().next().value ?? {
      modelId,
      inputUsdPerMTok: 0.5,
      outputTextUsdPerMTok: 3,
      outputImageUsdPerMTok: 60,
      source: "fallback" as const,
    }
  );
}

export async function recordVisionUsage(input: {
  operation: VisionCostOperation;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  hasImageOutput: boolean;
}) {
  await ensureVisionCostSession();
  const state = getState();
  const rate = rateForModel(input.modelId);
  const costs = costForUsage(
    rate,
    input.inputTokens,
    input.outputTokens,
    input.hasImageOutput,
  );

  const event: VisionUsageEvent = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    operation: input.operation,
    modelId: input.modelId,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    inputCostUsd: costs.inputCostUsd,
    outputCostUsd: costs.outputCostUsd,
    totalCostUsd: costs.totalCostUsd,
    hasImageOutput: input.hasImageOutput,
  };

  state.events.push(event);
  state.totals.inputTokens += event.inputTokens;
  state.totals.outputTokens += event.outputTokens;
  state.totals.inputCostUsd += event.inputCostUsd;
  state.totals.outputCostUsd += event.outputCostUsd;
  state.totals.totalCostUsd += event.totalCostUsd;
  state.totals.callCount += 1;

  const line =
    `${event.at} | ${event.operation} | model=${event.modelId}` +
    ` | in=${event.inputTokens} out=${event.outputTokens}` +
    ` | cost_in=$${event.inputCostUsd.toFixed(6)} cost_out=$${event.outputCostUsd.toFixed(6)}` +
    ` total=$${event.totalCostUsd.toFixed(6)}` +
    (event.hasImageOutput ? " | image_output" : "");

  await appendVisionCostLogLine(line);
  await appendVisionCostLogLine(
    `SESSION_TOTAL in=${state.totals.inputTokens} out=${state.totals.outputTokens}` +
      ` cost=$${state.totals.totalCostUsd.toFixed(6)} calls=${state.totals.callCount}`,
  );
}

export function getVisionCostSessionSnapshot(): VisionCostSessionSnapshot {
  const state = getState();
  return {
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    ratesFetchedAt: state.ratesFetchedAt,
    ratesSource: state.ratesSource,
    modelRates: [...state.modelRates.values()],
    events: [...state.events],
    totals: { ...state.totals },
    logFilePath: VISION_COST_LOG_FILE,
  };
}

export function modelIdFromLanguageModel(model: LanguageModel): string {
  if (typeof model === "string") return model;
  if ("modelId" in model && typeof model.modelId === "string") {
    return model.modelId;
  }
  return "unknown";
}
