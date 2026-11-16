import { parseDollarsToCents } from "@/lib/credits/money";
import {
  grossMarginPct,
  listPriceCents,
  MAX_FREE_QUOTA,
  MAX_MARKUP_PCT,
  MAX_MIN_PRICE_CENTS,
  type ObservedAiCost,
  type PriceItem,
  type PrintCostSample,
} from "@/lib/pricing/types";

/** "0.1253" → 12.53 cents; up to 4 decimal places of a dollar. */
export function parseCostDollars(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) return null;
  return Math.round(Number.parseFloat(trimmed) * 1_000_000) / 10_000;
}

export function parsePercent(input: string): number | null {
  const trimmed = input.trim().replace(/%$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number.parseFloat(trimmed);
  return value <= MAX_MARKUP_PCT ? value : null;
}

export type Draft = { cost: string; markup: string; minPrice: string; freeQuota: string; billable: boolean };

export function draftFor(item: PriceItem): Draft {
  return {
    cost: item.unitCostCents == null ? "" : (item.unitCostCents / 100).toFixed(4),
    markup: String(item.markupPct),
    minPrice: (item.minPriceCents / 100).toFixed(2),
    freeQuota: String(item.freeQuota),
    billable: item.billable,
  };
}

export type ParsedDraft = {
  cost: number | null;
  markup: number | null;
  minPrice: number | null;
  freeQuota: number | null;
};

export function parseDraft(draft: Draft, item: PriceItem): ParsedDraft {
  const minPrice = parseDollarsToCents(draft.minPrice);
  const freeQuota = /^\d+$/.test(draft.freeQuota.trim()) ? Number.parseInt(draft.freeQuota, 10) : null;
  return {
    cost: item.costBasis === "fixed" ? parseCostDollars(draft.cost) : item.unitCostCents,
    markup: parsePercent(draft.markup),
    minPrice: minPrice != null && minPrice >= 0 && minPrice <= MAX_MIN_PRICE_CENTS ? minPrice : null,
    freeQuota: freeQuota != null && freeQuota <= MAX_FREE_QUOTA ? freeQuota : null,
  };
}

export function isPrintItem(item: PriceItem): boolean {
  return item.costBasis === "lulu_quote";
}

export type PricePreview = {
  /** Our cost per unit: the unit cost, or Lulu's cost for the sample book. */
  costCents: number | null;
  /** Cost plus markup, never under the minimum. */
  listCents: number | null;
  /** What a customer actually pays: the list price when charging; free for AI and the PDF when off,
   * at cost for a printed book when off (the printer still has to be paid). */
  chargedCents: number | null;
  profitCents: number | null;
  marginPct: number | null;
  /** The higher of the entered cost and what a call typically costs at the high end (p90). */
  worstCostCents: number;
  /** The price doesn't cover what it usually costs us. */
  losing: boolean;
  valid: boolean;
};

export function previewPrice(
  item: PriceItem,
  draft: Draft,
  observed: ObservedAiCost | null,
  printCost: PrintCostSample | null,
): PricePreview {
  const parsed = parseDraft(draft, item);
  const isPrint = isPrintItem(item);
  const valid =
    parsed.markup != null && parsed.minPrice != null && parsed.freeQuota != null && (isPrint || parsed.cost != null);
  const costCents = isPrint ? (printCost?.printCostCents ?? null) : parsed.cost;
  const listCents =
    costCents != null && parsed.markup != null && parsed.minPrice != null
      ? listPriceCents(costCents, parsed.markup, parsed.minPrice)
      : null;
  const chargedCents = listCents == null ? null : draft.billable ? listCents : isPrint ? costCents : 0;
  const profitCents = chargedCents != null && costCents != null ? chargedCents - costCents : null;
  const marginPct = chargedCents != null && costCents != null ? grossMarginPct(costCents, chargedCents) : null;
  const worstCostCents = Math.max(costCents ?? 0, observed?.p90Cents ?? 0);
  const losing = chargedCents != null && chargedCents < worstCostCents;
  return { costCents, listCents, chargedCents, profitCents, marginPct, worstCostCents, losing, valid };
}
