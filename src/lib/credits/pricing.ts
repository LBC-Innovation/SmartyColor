/** What coloring sheets cost from the wallet, in USD cents. */

export const SHEET_GENERATION_CENTS = 12;
export const SHEET_EDIT_CENTS = 5;
/** AI edits each coloring sheet gets before edits are charged. */
export const FREE_EDITS_PER_SHEET = 3;
/** An AI portrait version of a landscape photo; priced like generating a sheet. */
export const PHOTO_PORTRAIT_CENTS = SHEET_GENERATION_CENTS;
/** A print-at-home PDF of an arranged book. */
export const DIGITAL_BOOK_CENTS = 100;

export type SheetUsageKind = "generation" | "edit" | "portrait";

/** Error code the API sends (HTTP 402) when the wallet can't cover a sheet action. */
export const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS";

export function sheetUsagePriceCents(kind: SheetUsageKind): number {
  if (kind === "edit") return SHEET_EDIT_CENTS;
  return kind === "portrait" ? PHOTO_PORTRAIT_CENTS : SHEET_GENERATION_CENTS;
}

/** Cost of the next action on a sheet that has already had `editCount` AI edits. */
export function sheetUsageCostCents(kind: SheetUsageKind, editCount = 0): number {
  if (kind === "edit" && editCount < FREE_EDITS_PER_SHEET) return 0;
  return sheetUsagePriceCents(kind);
}
