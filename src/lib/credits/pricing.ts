/**
 * Wallet-priced actions. Prices live in the price catalog (src/lib/pricing,
 * edited on /admin/pricing); this maps app actions onto it.
 */
import type { PriceSku, PublicPriceList } from "@/lib/pricing/types";

export type SheetUsageKind = "generation" | "edit" | "portrait";

/** Error code the API sends (HTTP 402) when the wallet can't cover an action. */
export const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS";

export const SHEET_USAGE_SKU: Record<SheetUsageKind, PriceSku> = {
  generation: "ai.sheet_generation",
  edit: "ai.sheet_edit",
  portrait: "ai.photo_portrait",
};

/** What one unit of an item charges the wallet; null while the price list is unknown. */
export function unitPriceCents(prices: PublicPriceList | null, sku: PriceSku): number | null {
  const price = prices?.[sku];
  if (!price || price.listPriceCents == null) return null;
  return price.billable ? price.listPriceCents : 0;
}

/** Cost of the next action on a sheet that has already had `editCount` AI edits. */
export function sheetUsageCostCents(
  prices: PublicPriceList | null,
  kind: SheetUsageKind,
  editCount = 0,
): number | null {
  const sku = SHEET_USAGE_SKU[kind];
  const freeQuota = prices?.[sku]?.freeQuota ?? 0;
  if (kind === "edit" && prices?.[sku] && editCount < freeQuota) return 0;
  return unitPriceCents(prices, sku);
}

/** AI edits each coloring sheet gets before edits are charged. */
export function freeEditsPerSheet(prices: PublicPriceList | null): number {
  return prices?.["ai.sheet_edit"]?.freeQuota ?? 0;
}
