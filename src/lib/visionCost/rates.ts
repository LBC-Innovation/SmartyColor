import type { ModelRateSnapshot } from "@/lib/visionCost/types";

const PRICING_URL =
  "https://ai.google.dev/gemini-api/docs/pricing.md.txt";

/** Known fallbacks when pricing fetch/parse fails (Standard tier, USD per 1M tokens). */
const FALLBACK_RATES: Record<
  string,
  Omit<ModelRateSnapshot, "modelId" | "source">
> = {
  "gemini-3.1-flash-image-preview": {
    inputUsdPerMTok: 0.5,
    outputTextUsdPerMTok: 3,
    outputImageUsdPerMTok: 60,
  },
  "gemini-3.1-flash-image": {
    inputUsdPerMTok: 0.5,
    outputTextUsdPerMTok: 3,
    outputImageUsdPerMTok: 60,
  },
  "gemini-3.6-flash": {
    inputUsdPerMTok: 0.75,
    outputTextUsdPerMTok: 3.75,
    outputImageUsdPerMTok: null,
  },
};

function pricingLookupIds(modelId: string): string[] {
  const ids = new Set<string>([modelId]);
  if (modelId.endsWith("-preview")) {
    ids.add(modelId.slice(0, -"-preview".length));
  }
  return [...ids];
}

function extractModelSection(markdown: string, modelId: string): string | null {
  const patterns = [
    new RegExp(`\\[\`${modelId.replace(/\./g, "\\.")}\`\\]`, "i"),
    new RegExp(`\\*\\[\`${modelId.replace(/\./g, "\\.")}\`\\]`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(markdown);
    if (match?.index != null) {
      const start = Math.max(0, markdown.lastIndexOf("\n## ", match.index));
      const next = markdown.indexOf("\n## ", match.index + 1);
      return markdown.slice(start, next === -1 ? undefined : next);
    }
  }
  return null;
}

function paidTierCellFromRow(row: string): string | null {
  const cells = row.split("|").map((cell) => cell.trim());
  if (cells.length < 4) return null;
  return cells[cells.length - 2] ?? null;
}

function firstUsdInCell(cell: string): number | null {
  const match = cell.match(/\$(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : null;
}

function parseStandardTier(section: string): Omit<
  ModelRateSnapshot,
  "modelId" | "source"
> | null {
  const standardStart = section.indexOf("### Standard");
  if (standardStart === -1) return null;
  const batchStart = section.indexOf("### Batch", standardStart);
  const slice = section.slice(
    standardStart,
    batchStart === -1 ? undefined : batchStart,
  );

  const inputRow = slice.match(/\| Input price[^\n]+\n/i)?.[0];
  const outputRow = slice.match(/\| Output price[^\n]+\n/i)?.[0];
  if (!inputRow || !outputRow) return null;

  const inputCell = paidTierCellFromRow(inputRow);
  const outputCell = paidTierCellFromRow(outputRow);
  if (!inputCell || !outputCell) return null;

  const inputUsdPerMTok = firstUsdInCell(inputCell);
  const textOutMatch = outputCell.match(/\$(\d+(?:\.\d+)?)\s*\(text/i);
  const imageOutMatch = outputCell.match(/\$(\d+(?:\.\d+)?)\s*\(images/i);
  const outputTextUsdPerMTok =
    (textOutMatch
      ? Number.parseFloat(textOutMatch[1])
      : firstUsdInCell(outputCell)) ?? null;

  if (inputUsdPerMTok == null || outputTextUsdPerMTok == null) return null;

  return {
    inputUsdPerMTok,
    outputTextUsdPerMTok,
    outputImageUsdPerMTok: imageOutMatch
      ? Number.parseFloat(imageOutMatch[1])
      : null,
  };
}

function fallbackForModel(modelId: string): ModelRateSnapshot {
  for (const id of pricingLookupIds(modelId)) {
    const row = FALLBACK_RATES[id];
    if (row) {
      return { modelId, ...row, source: "fallback" };
    }
  }
  return {
    modelId,
    inputUsdPerMTok: 0.5,
    outputTextUsdPerMTok: 3,
    outputImageUsdPerMTok: 60,
    source: "fallback",
  };
}

export async function fetchGoogleGeminiRatesForModels(
  modelIds: string[],
): Promise<{ fetchedAt: string; source: string; rates: ModelRateSnapshot[] }> {
  const unique = [...new Set(modelIds.filter(Boolean))];
  let markdown = "";
  let source = PRICING_URL;

  try {
    const response = await fetch(PRICING_URL, {
      next: { revalidate: 0 },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    markdown = await response.text();
  } catch {
    return {
      fetchedAt: new Date().toISOString(),
      source: "fallback (pricing fetch failed)",
      rates: unique.map(fallbackForModel),
    };
  }

  const rates = unique.map((modelId) => {
    for (const lookupId of pricingLookupIds(modelId)) {
      const section = extractModelSection(markdown, lookupId);
      if (!section) continue;
      const parsed = parseStandardTier(section);
      if (parsed) {
        return { modelId, ...parsed, source: "google-pricing" as const };
      }
    }
    return fallbackForModel(modelId);
  });

  return {
    fetchedAt: new Date().toISOString(),
    source,
    rates,
  };
}

export function costForUsage(
  rate: ModelRateSnapshot,
  inputTokens: number,
  outputTokens: number,
  hasImageOutput: boolean,
): { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number } {
  const inputCostUsd = (inputTokens / 1_000_000) * rate.inputUsdPerMTok;
  const outputRate =
    hasImageOutput && rate.outputImageUsdPerMTok != null
      ? rate.outputImageUsdPerMTok
      : rate.outputTextUsdPerMTok;
  const outputCostUsd = (outputTokens / 1_000_000) * outputRate;
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
  };
}
