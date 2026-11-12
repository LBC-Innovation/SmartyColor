import type { AddressSuggestion } from "@/lib/orders/types";
import { luluFetch } from "@/server/lulu/client";

type CostResponse = {
  total_cost_incl_tax?: string;
  total_cost_excl_tax?: string;
  total_tax?: string;
  currency?: string;
  line_item_costs?: Array<{ total_cost_excl_tax?: string }>;
  shipping_cost?: { total_cost_excl_tax?: string };
  fulfillment_cost?: { total_cost_excl_tax?: string };
  shipping_address?: {
    warnings?: Array<{ type?: string; code?: string; path?: string; message?: string }>;
    suggested_address?: {
      country_code?: string | null;
      state_code?: string | null;
      postcode?: string | null;
      city?: string | null;
      street1?: string | null;
      street2?: string | null;
    } | null;
  };
};

/** Lulu's quote split so print + shipping + tax adds up to the total, all in cents. */
export type LuluPrintJobCostBreakdown = {
  /** What checkout charges: printing, shipping and tax together. */
  totalCents: number | null;
  /** The book before tax: Lulu's print cost plus its per-order fulfillment fee. */
  printCents: number | null;
  /** Shipping before tax. */
  shippingCents: number | null;
  /** Sales tax on the whole order (book, fee and shipping). */
  taxCents: number | null;
  currency: string;
  shippingLevel: string;
  /** Lulu's corrected spelling of the address; null when it had no change to suggest. */
  addressSuggestion: AddressSuggestion | null;
};

function parseMoneyToCents(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export type LuluQuoteShippingAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state_code: string;
  country_code: string;
  postcode: string;
  phone_number: string;
};

export function defaultQuoteShippingAddress(): LuluQuoteShippingAddress {
  return {
    name: process.env.LULU_QUOTE_NAME ?? "Quote Estimate",
    street1: process.env.LULU_QUOTE_STREET1 ?? "123 Main St",
    city: process.env.LULU_QUOTE_CITY ?? "Raleigh",
    state_code: process.env.LULU_QUOTE_STATE ?? "NC",
    country_code: process.env.LULU_QUOTE_COUNTRY ?? "US",
    postcode: process.env.LULU_QUOTE_POSTCODE ?? "27601",
    phone_number: process.env.LULU_QUOTE_PHONE ?? "9195550100",
  };
}

function sumLineItemCents(raw: CostResponse): number | null {
  if (!raw.line_item_costs?.length) return null;
  let sum = 0;
  for (const item of raw.line_item_costs) {
    const cents = parseMoneyToCents(item.total_cost_excl_tax);
    if (cents == null) return null;
    sum += cents;
  }
  return sum;
}

const fold = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * The address Lulu would rather use, or null when there is nothing to offer: no suggestion, or one
 * that equals the entered address once trimmed and case-folded. A null street2 is "no opinion", so
 * it is left out and never wipes the customer's apartment line.
 */
export function addressSuggestionFromResponse(
  raw: CostResponse,
  entered: Partial<LuluQuoteShippingAddress>,
): AddressSuggestion | null {
  const s = raw.shipping_address?.suggested_address;
  if (!s) return null;
  const suggested: AddressSuggestion["suggested"] = {};
  const fields = ["street1", "city", "state_code", "postcode", "country_code"] as const;
  let differs = false;
  for (const key of fields) {
    const value = s[key]?.trim();
    if (!value) continue;
    suggested[key] = value;
    if (fold(value) !== fold(entered[key])) differs = true;
  }
  const street2 = s.street2?.trim();
  if (street2) {
    suggested.street2 = street2;
    if (fold(street2) !== fold(entered.street2)) differs = true;
  }
  if (!differs) return null;
  const warnings = (raw.shipping_address?.warnings ?? [])
    .filter((w) => w.code || w.message)
    .map((w) => ({ code: w.code ?? "", message: w.message ?? "" }));
  return { warnings, suggested };
}

export async function fetchLuluPrintJobCost(input: {
  podPackageId: string;
  pageCount: number;
  quantity?: number;
  shippingLevel?: string;
  shippingAddress?: Partial<LuluQuoteShippingAddress>;
}): Promise<LuluPrintJobCostBreakdown> {
  const shippingLevel = input.shippingLevel ?? "MAIL";
  // A suggestion only means something for an address the customer actually typed.
  const hasRealStreet = Boolean(input.shippingAddress?.street1?.trim());
  const shipping_address: LuluQuoteShippingAddress = {
    ...defaultQuoteShippingAddress(),
    ...input.shippingAddress,
  };

  const payload = {
    line_items: [
      {
        pod_package_id: input.podPackageId,
        page_count: input.pageCount,
        quantity: input.quantity ?? 1,
      },
    ],
    shipping_address,
    shipping_option: shippingLevel,
  };

  const raw = await luluFetch<CostResponse>("/print-job-cost-calculations/", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const totalCents =
    parseMoneyToCents(raw.total_cost_incl_tax) ??
    parseMoneyToCents(raw.total_cost_excl_tax);
  const lineItemCents = sumLineItemCents(raw);
  // The fulfillment fee is charged per order through the API; it goes with the book.
  const fulfillmentCents = raw.fulfillment_cost
    ? parseMoneyToCents(raw.fulfillment_cost.total_cost_excl_tax)
    : 0;
  const printCents =
    lineItemCents != null && fulfillmentCents != null ? lineItemCents + fulfillmentCents : null;
  const shippingCents = parseMoneyToCents(raw.shipping_cost?.total_cost_excl_tax);
  const exclTaxCents = parseMoneyToCents(raw.total_cost_excl_tax);
  const taxCents =
    parseMoneyToCents(raw.total_tax) ??
    (totalCents != null && exclTaxCents != null ? totalCents - exclTaxCents : null);

  return {
    totalCents,
    printCents,
    shippingCents,
    taxCents,
    currency: raw.currency ?? "USD",
    shippingLevel,
    addressSuggestion: hasRealStreet ? addressSuggestionFromResponse(raw, shipping_address) : null,
  };
}
