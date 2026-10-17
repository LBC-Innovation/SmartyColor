/**
 * The price catalog (table `price_items`, edited on /admin/pricing).
 *
 *   list price = max(ceil(cost × (1 + markup% / 100)), minimum price)
 *
 * The database computes this for fixed-cost items and charges from it; the
 * helpers here mirror it exactly (integer arithmetic, no float rounding) for
 * the admin preview and for printed books, which are priced per order from
 * Lulu's quote.
 */

export type PriceSku =
  | "ai.sheet_generation"
  | "ai.sheet_edit"
  | "ai.photo_portrait"
  | "ai.storybook_chat"
  | "ai.storybook_generate"
  | "book.digital"
  | "book.print.saddle_stitch"
  | "book.print.coil_bound"
  | "book.print.perfect_bound";

export type PriceCategory = "ai" | "digital" | "print";
export type PriceCostBasis = "fixed" | "lulu_quote";

/** A catalog item as the admin sees it, cost included. */
export type PriceItem = {
  sku: PriceSku;
  category: PriceCategory;
  name: string;
  description: string | null;
  costBasis: PriceCostBasis;
  /** Our cost per unit in USD cents (sub-cent precision); null for Lulu-quoted items. */
  unitCostCents: number | null;
  markupPct: number;
  minPriceCents: number;
  freeQuota: number;
  billable: boolean;
  aiOperation: string | null;
  bindingId: string | null;
  /** What the wallet is charged per unit; null for Lulu-quoted items. */
  listPriceCents: number | null;
  updatedAt: string;
};

/** What a customer pays for an item; never includes our cost. */
export type PublicPrice = {
  /** Per unit for fixed items; null for printed books (quoted per order). */
  listPriceCents: number | null;
  freeQuota: number;
  billable: boolean;
};

export type PublicPriceList = Record<PriceSku, PublicPrice>;

export const MAX_MARKUP_PCT = 1000;
export const MAX_MIN_PRICE_CENTS = 1000_00;
export const MAX_FREE_QUOTA = 100;

export const PRINT_SKU_FOR_BINDING = {
  saddle_stitch: "book.print.saddle_stitch",
  coil_bound: "book.print.coil_bound",
  perfect_bound: "book.print.perfect_bound",
} as const satisfies Record<string, PriceSku>;

/** Markup as basis points, so prices are computed in integers. */
function markupBasisPoints(markupPct: number): number {
  return Math.round(markupPct * 100);
}

/**
 * Cost plus markup, rounded up to the cent, never under the floor. Matches the
 * `list_price_cents` column: cost is taken to 4 decimal places like
 * numeric(12,4), and the arithmetic is exact.
 */
export function listPriceCents(costCents: number, markupPct: number, minPriceCents = 0): number {
  const costE4 = Math.round(costCents * 10_000);
  const scaled = costE4 * (10_000 + markupBasisPoints(markupPct));
  const marked = Math.floor((scaled + 100_000_000 - 1) / 100_000_000);
  return Math.max(marked, minPriceCents);
}

/** Share of the price that is profit, as a percentage; null when the price is zero. */
export function grossMarginPct(costCents: number, priceCents: number): number | null {
  if (priceCents <= 0) return null;
  return ((priceCents - costCents) / priceCents) * 100;
}

/** A printed book's price: the book is marked up, shipping and tax pass through at cost. */
export type PrintPriceBreakdown = {
  /** Lulu's charge for the book (print + fulfillment fee) — our cost. */
  printCostCents: number;
  /** The book as the customer pays for it. */
  printPriceCents: number;
  markupCents: number;
  shippingCents: number;
  taxCents: number;
  /** Lulu's total — what the order costs us. */
  costTotalCents: number;
  /** What the customer pays. */
  totalCents: number;
};

export function priceLuluQuote(
  quote: { printCents: number; shippingCents: number; taxCents: number },
  item: { markupPct: number; minPriceCents: number },
): PrintPriceBreakdown {
  const printPriceCents = listPriceCents(quote.printCents, item.markupPct, item.minPriceCents);
  return {
    printCostCents: quote.printCents,
    printPriceCents,
    markupCents: printPriceCents - quote.printCents,
    shippingCents: quote.shippingCents,
    taxCents: quote.taxCents,
    costTotalCents: quote.printCents + quote.shippingCents + quote.taxCents,
    totalCents: printPriceCents + quote.shippingCents + quote.taxCents,
  };
}

/** Observed AI cost per call over the last 30 days, in USD cents. */
export type ObservedAiCost = {
  operation: string;
  calls: number;
  avgCents: number;
  p90Cents: number;
  maxCents: number;
};

/** Lulu's live cost for a sample printed book, used to show print items' cost and price. */
export type PrintCostSample = {
  sku: PriceSku;
  pageCount: number;
  /** Lulu's charge for the book (print + fulfillment fee). */
  printCostCents: number | null;
  shippingCents: number | null;
  taxCents: number | null;
  error: string | null;
};

export type PriceChange = {
  id: string;
  sku: PriceSku;
  changedAt: string;
  changedByEmail: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown>;
};

export type AdminPricingData = {
  items: PriceItem[];
  observedAiCosts: ObservedAiCost[];
  changes: PriceChange[];
};
