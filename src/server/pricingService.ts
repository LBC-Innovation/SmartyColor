import "server-only";
import type { ApiResult } from "@/lib/api/types";
import { getBookBinding, type BookBindingId } from "@/lib/print/bookBindings";
import {
  MAX_FREE_QUOTA,
  MAX_MARKUP_PCT,
  MAX_MIN_PRICE_CENTS,
  PRINT_SKU_FOR_BINDING,
  priceLuluQuote,
  type ObservedAiCost,
  type PriceChange,
  type PriceItem,
  type PriceSku,
  type PrintCostSample,
  type PrintPriceBreakdown,
  type PublicPriceList,
} from "@/lib/pricing/types";
import { getSupabaseAdmin, getSupabaseAuth } from "@/lib/supabase/service";
import { fetchLuluPrintJobCost, type LuluQuoteShippingAddress } from "@/server/lulu/costCalculation";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

const COLUMNS =
  "sku, category, name, description, cost_basis, unit_cost_cents, markup_pct, min_price_cents, free_quota, billable, ai_operation, binding_id, list_price_cents, updated_at";

type PriceRow = {
  sku: string;
  category: string;
  name: string;
  description: string | null;
  cost_basis: string;
  unit_cost_cents: string | number | null;
  markup_pct: string | number;
  min_price_cents: number;
  free_quota: number;
  billable: boolean;
  ai_operation: string | null;
  binding_id: string | null;
  list_price_cents: number | null;
  updated_at: string;
};

// numeric columns arrive as strings from PostgREST.
function toItem(row: PriceRow): PriceItem {
  return {
    sku: row.sku as PriceSku,
    category: row.category as PriceItem["category"],
    name: row.name,
    description: row.description,
    costBasis: row.cost_basis as PriceItem["costBasis"],
    unitCostCents: row.unit_cost_cents == null ? null : Number(row.unit_cost_cents),
    markupPct: Number(row.markup_pct),
    minPriceCents: row.min_price_cents,
    freeQuota: row.free_quota,
    billable: row.billable,
    aiOperation: row.ai_operation,
    bindingId: row.binding_id,
    listPriceCents: row.list_price_cents,
    updatedAt: row.updated_at,
  };
}

export async function listPriceItems(): Promise<ApiResult<PriceItem[]>> {
  const { data, error } = await getSupabaseAdmin()
    .from("price_items")
    .select(COLUMNS)
    .order("sort_order", { ascending: true });
  if (error) return { data: null, error: { message: error.message } };
  return { data: (data as PriceRow[]).map(toItem), error: null };
}

export async function getPriceItem(sku: PriceSku): Promise<ApiResult<PriceItem>> {
  const { data, error } = await getSupabaseAdmin().from("price_items").select(COLUMNS).eq("sku", sku).maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!data) return { data: null, error: { message: `Price not configured for ${sku}`, code: "PRICE_MISSING" } };
  return { data: toItem(data as PriceRow), error: null };
}

/** What customers pay for each item, without our costs. */
export async function getPublicPriceList(): Promise<ApiResult<PublicPriceList>> {
  const items = await listPriceItems();
  if (items.error) return items;
  const list = {} as PublicPriceList;
  for (const item of items.data) {
    list[item.sku] = { listPriceCents: item.listPriceCents, freeQuota: item.freeQuota, billable: item.billable };
  }
  return { data: list, error: null };
}

/** What one unit of a fixed-price item charges the wallet (0 when it isn't billable). */
export async function chargeableCents(sku: PriceSku): Promise<ApiResult<number>> {
  const item = await getPriceItem(sku);
  if (item.error) return item;
  if (item.data.listPriceCents == null) {
    return { data: null, error: { message: `${sku} is not a fixed-price item`, code: "PRICE_MISSING" } };
  }
  return { data: item.data.billable ? item.data.listPriceCents : 0, error: null };
}

export type PriceItemUpdate = {
  unitCostCents?: number;
  markupPct?: number;
  minPriceCents?: number;
  freeQuota?: number;
  billable?: boolean;
};

function validateUpdate(item: PriceItem, input: PriceItemUpdate): string | null {
  if (input.unitCostCents !== undefined) {
    if (item.costBasis !== "fixed") return "This item's cost comes from Lulu's quote and can't be set here.";
    if (!Number.isFinite(input.unitCostCents) || input.unitCostCents < 0 || input.unitCostCents > 100_000_00) {
      return "Cost must be a positive amount.";
    }
  }
  if (input.markupPct !== undefined) {
    if (!Number.isFinite(input.markupPct) || input.markupPct < 0 || input.markupPct > MAX_MARKUP_PCT) {
      return `Markup must be between 0% and ${MAX_MARKUP_PCT}%.`;
    }
  }
  if (input.minPriceCents !== undefined) {
    if (!Number.isInteger(input.minPriceCents) || input.minPriceCents < 0 || input.minPriceCents > MAX_MIN_PRICE_CENTS) {
      return "Minimum price must be between $0 and $1,000.";
    }
  }
  if (input.freeQuota !== undefined) {
    if (!Number.isInteger(input.freeQuota) || input.freeQuota < 0 || input.freeQuota > MAX_FREE_QUOTA) {
      return `Free uses must be a whole number from 0 to ${MAX_FREE_QUOTA}.`;
    }
  }
  return null;
}

export async function updatePriceItem(
  sku: PriceSku,
  input: PriceItemUpdate,
  adminId: string,
): Promise<ApiResult<PriceItem>> {
  const current = await getPriceItem(sku);
  if (current.error) return current;
  const invalid = validateUpdate(current.data, input);
  if (invalid) return { data: null, error: { message: invalid, code: "INVALID" } };

  const update: Record<string, unknown> = { updated_by: adminId };
  if (input.unitCostCents !== undefined) update.unit_cost_cents = Math.round(input.unitCostCents * 10_000) / 10_000;
  if (input.markupPct !== undefined) update.markup_pct = Math.round(input.markupPct * 100) / 100;
  if (input.minPriceCents !== undefined) update.min_price_cents = input.minPriceCents;
  if (input.freeQuota !== undefined) update.free_quota = input.freeQuota;
  if (input.billable !== undefined) update.billable = input.billable;

  const { data, error } = await getSupabaseAdmin()
    .from("price_items")
    .update(update)
    .eq("sku", sku)
    .select(COLUMNS)
    .single();
  if (error || !data) return { data: null, error: { message: error?.message ?? "Price not found" } };

  const item = toItem(data as PriceRow);
  log("info", "Admin updated price", { adminId, sku, ...input, listPriceCents: item.listPriceCents });
  return { data: item, error: null };
}

export async function listPriceChanges(limit = 50): Promise<ApiResult<PriceChange[]>> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("price_item_changes")
    .select("id, sku, changed_at, changed_by, old_values, new_values")
    .not("old_values", "is", null)
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) return { data: null, error: { message: error.message } };

  const ids = [...new Set((data ?? []).map((r) => r.changed_by as string | null).filter((v): v is string => !!v))];
  const emails = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      // Best effort: a change still shows without its author's email.
      const { data: u } = await getSupabaseAuth().auth.admin.getUserById(id).catch(() => ({ data: null }));
      if (u?.user?.email) emails.set(id, u.user.email);
    }),
  );

  return {
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      sku: r.sku as PriceSku,
      changedAt: r.changed_at as string,
      changedByEmail: r.changed_by ? (emails.get(r.changed_by as string) ?? null) : null,
      oldValues: (r.old_values as Record<string, unknown> | null) ?? null,
      newValues: r.new_values as Record<string, unknown>,
    })),
    error: null,
  };
}

/** Observed AI cost per call over the last 30 days, by vision operation. */
export async function observedAiCosts(): Promise<ApiResult<ObservedAiCost[]>> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("vision_usage_events")
    .select("operation, total_cost_usd")
    .gte("at", since)
    .limit(20_000);
  if (error) return { data: null, error: { message: error.message } };

  const byOp = new Map<string, number[]>();
  for (const row of data ?? []) {
    const list = byOp.get(row.operation as string) ?? [];
    list.push(Number(row.total_cost_usd ?? 0) * 100);
    byOp.set(row.operation as string, list);
  }
  return {
    data: [...byOp.entries()].map(([operation, cents]) => {
      const sorted = [...cents].sort((a, b) => a - b);
      const p90 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)];
      return {
        operation,
        calls: sorted.length,
        avgCents: sorted.reduce((s, c) => s + c, 0) / sorted.length,
        p90Cents: p90,
        maxCents: sorted[sorted.length - 1],
      };
    }),
    error: null,
  };
}

/** A printed book priced from Lulu's live quote. */
export type PrintOrderPricing = {
  sku: PriceSku;
  markupPct: number;
  shippingLevel: string;
  price: PrintPriceBreakdown;
};

export async function pricePrintOrder(input: {
  bindingId: BookBindingId;
  pageCount: number;
  shippingLevel?: string;
  shippingAddress?: Partial<LuluQuoteShippingAddress>;
}): Promise<ApiResult<PrintOrderPricing>> {
  const sku = PRINT_SKU_FOR_BINDING[input.bindingId];
  const [item, quote] = await Promise.all([
    getPriceItem(sku),
    fetchLuluPrintJobCost({
      podPackageId: getBookBinding(input.bindingId).podPackageId,
      pageCount: input.pageCount,
      shippingLevel: input.shippingLevel,
      shippingAddress: input.shippingAddress,
    }),
  ]);
  if (item.error) return item;
  if (quote.printCents == null || quote.shippingCents == null) {
    return { data: null, error: { message: "The printer didn't return a price for this book.", code: "QUOTE_UNAVAILABLE" } };
  }
  // Tax missing means none was charged; Lulu omits it for untaxed destinations.
  const price = priceLuluQuote(
    { printCents: quote.printCents, shippingCents: quote.shippingCents, taxCents: quote.taxCents ?? 0 },
    item.data,
  );
  if (!item.data.billable) {
    // Not billable for a printed book means sold at cost: the printer still has to be paid.
    price.printPriceCents = price.printCostCents;
    price.markupCents = 0;
    price.totalCents = price.costTotalCents;
  }
  return {
    data: { sku, markupPct: item.data.billable ? item.data.markupPct : 0, shippingLevel: quote.shippingLevel, price },
    error: null,
  };
}

/**
 * What Lulu charges for a sample book in each binding, to the default quote
 * address. The page count is fitted to each binding's page rules.
 */
export async function samplePrintCosts(pageCount: number): Promise<PrintCostSample[]> {
  const bindings = Object.keys(PRINT_SKU_FOR_BINDING) as BookBindingId[];
  return Promise.all(
    bindings.map(async (bindingId): Promise<PrintCostSample> => {
      const spec = getBookBinding(bindingId);
      const fitted = Math.min(
        spec.maxPages,
        Math.max(spec.minPages, Math.ceil(pageCount / spec.pageMultiple) * spec.pageMultiple),
      );
      const sku = PRINT_SKU_FOR_BINDING[bindingId];
      try {
        const quote = await fetchLuluPrintJobCost({ podPackageId: spec.podPackageId, pageCount: fitted });
        return {
          sku,
          pageCount: fitted,
          printCostCents: quote.printCents,
          shippingCents: quote.shippingCents,
          taxCents: quote.taxCents,
          error: quote.printCents == null ? "Lulu returned no print cost" : null,
        };
      } catch (e) {
        return {
          sku,
          pageCount: fitted,
          printCostCents: null,
          shippingCents: null,
          taxCents: null,
          error: e instanceof Error ? e.message : "Lulu quote failed",
        };
      }
    }),
  );
}
