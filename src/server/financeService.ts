import "server-only";
import type { ApiResult } from "@/lib/api/types";
import {
  COST_CADENCES,
  COST_CATEGORIES,
  type CostLine,
  type FinanceCost,
  type FinanceCostInput,
  type FinanceReport,
  type FinanceSettings,
  type Insight,
  type PeriodTotals,
  type ProductLine,
  type SeriesPoint,
} from "@/lib/finance/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/**
 * Builds the financials report from what the app already records:
 *
 *   credit_stripe_sessions / credit_ledger  card top-ups, wallet charges, promo grants, refunds
 *   book_orders                             print orders and what Lulu charged us
 *   vision_usage_events                     every AI call's cost (summed per day in SQL)
 *   finance_costs / finance_settings        what the app can't see, entered on the page
 *
 * Revenue is recognised when wallet money is spent, not when it is topped up. To
 * split each charge into promo-funded and customer-funded money, every account's
 * ledger is replayed in order with two buckets; charges draw promo credit first
 * (the conservative choice: it recognises the least customer-funded revenue and
 * keeps the prepaid-balance liability at its largest). The full ledger is read on
 * every request, which is fine at today's volume; move the replay into SQL or a
 * nightly snapshot once the ledger is in the hundreds of thousands of rows.
 */

const DAY_MS = 86_400_000;
const PAGE = 1000;

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

// --- Source rows ------------------------------------------------------------------------------

/** Wallet charges that buy something. Everything else negative is an admin adjustment. */
const PURCHASE_REASONS = new Set([
  "sheet_generation",
  "sheet_edit",
  "photo_portrait",
  "ai_usage",
  "digital_book_payment",
  "order_payment",
]);

const REASON_SKU: Record<string, string> = {
  sheet_generation: "ai.sheet_generation",
  sheet_edit: "ai.sheet_edit",
  photo_portrait: "ai.photo_portrait",
  digital_book_payment: "book.digital",
};

/** Orders placed before the price catalog carry only a print product id. */
const PRODUCT_SKU: Record<string, string> = {
  "coloring-book-pb-bw-85x11": "book.print.perfect_bound",
  "coloring-book-saddle-bw-85x11": "book.print.saddle_stitch",
  "coloring-book-coil-bw-85x11": "book.print.coil_bound",
  "coloring-book-digital-pdf": "book.digital",
};

/** Statuses where the customer has paid and Lulu is (or was) making the book. */
const FULFILLED_STATUSES = new Set([
  "paid",
  "submitting_to_lulu",
  "submitted_to_lulu",
  "in_production",
  "shipped",
  "delivered",
]);

const UNMAPPED_AI = "ai.unmapped";

type LedgerRow = {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  reference_id: string | null;
  price_sku: string | null;
  cogs_cents: string | number | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  status: string;
  fulfillment: string;
  product_id: string;
  price_sku: string | null;
  credits_applied: number;
  lulu_cost_cents: number | null;
  paid_at: string | null;
  submitted_to_lulu_at: string | null;
  canceled_at: string | null;
};

type PriceRow = {
  sku: string;
  category: string;
  name: string;
  unit_cost_cents: string | number | null;
  ai_operation: string | null;
};

type AiDayRow = { day: string; operation: string; calls: number; cost_usd: string | number };

type CostRow = {
  id: string;
  name: string;
  vendor: string | null;
  category: string;
  cadence: string;
  amount_cents: number;
  starts_on: string;
  ends_on: string | null;
  notes: string | null;
  updated_at: string;
};

type SettingsRow = {
  card_fee_pct: string | number;
  card_fee_fixed_cents: number;
  opening_cash_cents: string | number | null;
  opening_cash_on: string | null;
  updated_at: string;
};

const DEFAULT_SETTINGS: FinanceSettings = {
  cardFeePct: 2.9,
  cardFeeFixedCents: 30,
  openingCashCents: null,
  openingCashOn: null,
  updatedAt: null,
};

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function fetchAll<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

// --- Normalised events --------------------------------------------------------------------------

type Sale = {
  at: number;
  sku: string;
  /** Negative for refunds. */
  grossCents: number;
  promoCents: number;
  units: number;
  /** Our cost recorded with the charge, per unit (catalog items only). */
  unitCogsCents: number | null;
};

type TopUp = { at: number; userId: string; cents: number; feeCents: number };
type Grant = { at: number; cents: number };
type AiCost = { at: number; sku: string; calls: number; cents: number };
type PrintCost = { at: number; sku: string; cents: number };
type WalletPoint = { at: number; paid: number; promo: number };

type Dataset = {
  sales: Sale[];
  topUps: TopUp[];
  grants: Grant[];
  aiCosts: AiCost[];
  printCosts: PrintCost[];
  wallet: WalletPoint[];
  signups: number[];
  firstTopUpAt: Map<string, number>;
  costs: FinanceCost[];
  settings: FinanceSettings;
  products: Map<string, { name: string; group: ProductLine["group"]; unitCostCents: number | null }>;
  canceledCharged: { count: number; cents: number };
};

function num(value: string | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function cardFee(cents: number, settings: FinanceSettings): number {
  return Math.round((cents * settings.cardFeePct) / 100) + settings.cardFeeFixedCents;
}

function groupForSku(sku: string, category?: string): ProductLine["group"] {
  if (category === "ai" || sku.startsWith("ai.")) return "ai";
  if (category === "digital" || sku === "book.digital") return "digital";
  if (category === "print" || sku.startsWith("book.print")) return "print";
  return "other";
}

function toCost(row: CostRow): FinanceCost {
  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    category: row.category as FinanceCost["category"],
    cadence: row.cadence as FinanceCost["cadence"],
    amountCents: row.amount_cents,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

function toSettings(row: SettingsRow | null): FinanceSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    cardFeePct: Number(row.card_fee_pct),
    cardFeeFixedCents: row.card_fee_fixed_cents,
    openingCashCents: row.opening_cash_cents == null ? null : Number(row.opening_cash_cents),
    openingCashOn: row.opening_cash_on,
    updatedAt: row.updated_at,
  };
}

async function loadDataset(aiFrom: number, aiTo: number): Promise<{ data: Dataset; setupComplete: boolean }> {
  const db = getSupabaseAdmin();

  const [ledger, orders, sessions, prices, profiles, aiDays, costsRes, settingsRes] = await Promise.all([
    fetchAll<LedgerRow>((from, to) =>
      db
        .from("credit_ledger")
        .select("id, user_id, delta, reason, reference_id, price_sku, cogs_cents, created_at")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<OrderRow>((from, to) =>
      db
        .from("book_orders")
        .select(
          "id, status, fulfillment, product_id, price_sku, credits_applied, lulu_cost_cents, paid_at, submitted_to_lulu_at, canceled_at",
        )
        .order("created_at", { ascending: true })
        .range(from, to),
    ),
    fetchAll<{ stripe_checkout_session_id: string; user_id: string; amount_cents: number; credited_at: string }>(
      (from, to) =>
        db
          .from("credit_stripe_sessions")
          .select("stripe_checkout_session_id, user_id, amount_cents, credited_at")
          .order("credited_at", { ascending: true })
          .range(from, to),
    ),
    db.from("price_items").select("sku, category, name, unit_cost_cents, ai_operation").order("sort_order"),
    fetchAll<{ created_at: string }>((from, to) =>
      db.from("profiles").select("created_at").order("created_at", { ascending: true }).range(from, to),
    ),
    db.rpc("finance_ai_cost_daily", {
      p_from: new Date(aiFrom).toISOString(),
      p_to: new Date(aiTo).toISOString(),
    }),
    db
      .from("finance_costs")
      .select("id, name, vendor, category, cadence, amount_cents, starts_on, ends_on, notes, updated_at")
      .order("starts_on", { ascending: true }),
    db
      .from("finance_settings")
      .select("card_fee_pct, card_fee_fixed_cents, opening_cash_cents, opening_cash_on, updated_at")
      .maybeSingle(),
  ]);

  // 0023 not applied yet: show what the app records, without entered costs.
  const setupComplete = !costsRes.error && !settingsRes.error && !aiDays.error;
  if (!setupComplete) {
    log("warn", "finance tables unavailable", {
      costs: costsRes.error?.message,
      settings: settingsRes.error?.message,
      ai: aiDays.error?.message,
    });
  }
  if (prices.error) throw new Error(prices.error.message);

  const settings = settingsRes.error ? DEFAULT_SETTINGS : toSettings(settingsRes.data as SettingsRow | null);
  const costs = costsRes.error ? [] : (costsRes.data as CostRow[]).map(toCost);

  const products: Dataset["products"] = new Map();
  const skuForOperation = new Map<string, string>();
  for (const row of prices.data as PriceRow[]) {
    products.set(row.sku, {
      name: row.name,
      group: groupForSku(row.sku, row.category),
      unitCostCents: row.unit_cost_cents == null ? null : Number(row.unit_cost_cents),
    });
    if (row.ai_operation) skuForOperation.set(row.ai_operation, row.sku);
  }
  products.set(UNMAPPED_AI, { name: "Other AI calls (not sold)", group: "ai", unitCostCents: null });

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const orderSku = (o: OrderRow | undefined) =>
    o ? (o.price_sku ?? PRODUCT_SKU[o.product_id] ?? "book.print.other") : "book.print.other";

  // --- Replay the ledger ---
  const sales: Sale[] = [];
  const grants: Grant[] = [];
  const wallet: WalletPoint[] = [];
  const buckets = new Map<string, { paid: number; promo: number }>();
  /** Charges still refundable, per account + reference, newest last. */
  const charges = new Map<string, Array<{ sku: string; paid: number; promo: number }>>();
  let paidTotal = 0;
  let promoTotal = 0;

  for (const e of ledger) {
    const at = Date.parse(e.created_at);
    const b = buckets.get(e.user_id) ?? { paid: 0, promo: 0 };
    buckets.set(e.user_id, b);
    const beforePaid = b.paid;
    const beforePromo = b.promo;

    if (e.reason === "stripe_purchase") {
      b.paid += e.delta;
    } else if (PURCHASE_REASONS.has(e.reason) && e.delta < 0) {
      const amount = -e.delta;
      const fromPromo = Math.min(amount, Math.max(b.promo, 0));
      const fromPaid = amount - fromPromo;
      b.promo -= fromPromo;
      b.paid -= fromPaid;
      const order = e.reason === "order_payment" ? orderById.get(e.reference_id ?? "") : undefined;
      // A canceled order's charge isn't refunded automatically, but it isn't earned either:
      // it stays out of sales and is flagged in the insights as possibly owed back.
      if (order && (order.canceled_at || order.status === "canceled")) {
        paidTotal += b.paid - beforePaid;
        promoTotal += b.promo - beforePromo;
        wallet.push({ at, paid: paidTotal, promo: promoTotal });
        continue;
      }
      const sku =
        e.price_sku ??
        (e.reason === "order_payment" ? orderSku(order) : (REASON_SKU[e.reason] ?? "ai.other"));
      sales.push({
        at,
        sku,
        grossCents: amount,
        promoCents: fromPromo,
        units: 1,
        unitCogsCents: e.cogs_cents == null ? null : Number(e.cogs_cents),
      });
      if (e.reference_id) {
        const key = `${e.user_id}:${e.reference_id}`;
        const list = charges.get(key) ?? [];
        list.push({ sku, paid: fromPaid, promo: fromPromo });
        charges.set(key, list);
      }
    } else if (e.reason === "usage_refund" && e.delta > 0) {
      const list = e.reference_id ? charges.get(`${e.user_id}:${e.reference_id}`) : undefined;
      const charge = list?.findLast((c) => c.paid + c.promo > 0);
      if (charge) {
        const share = charge.promo / (charge.paid + charge.promo);
        const backPromo = Math.min(charge.promo, Math.round(e.delta * share));
        const backPaid = e.delta - backPromo;
        charge.promo -= backPromo;
        charge.paid = Math.max(0, charge.paid - backPaid);
        b.promo += backPromo;
        b.paid += backPaid;
        sales.push({ at, sku: charge.sku, grossCents: -e.delta, promoCents: -backPromo, units: -1, unitCogsCents: null });
      } else {
        b.paid += e.delta;
        sales.push({ at, sku: "other", grossCents: -e.delta, promoCents: 0, units: 0, unitCogsCents: null });
      }
    } else if (e.delta > 0) {
      // Welcome credit, admin grants, anything else given away.
      b.promo += e.delta;
      grants.push({ at, cents: e.delta });
    } else if (e.delta < 0) {
      // Admin removal: take back promo first.
      const fromPromo = Math.min(-e.delta, Math.max(b.promo, 0));
      b.promo -= fromPromo;
      b.paid -= -e.delta - fromPromo;
    }

    paidTotal += b.paid - beforePaid;
    promoTotal += b.promo - beforePromo;
    wallet.push({ at, paid: paidTotal, promo: promoTotal });
  }

  // --- Top-ups, the card fee on each, and each payer's first top-up ---
  const topUps: TopUp[] = sessions.map((s) => ({
    at: Date.parse(s.credited_at),
    userId: s.user_id,
    cents: s.amount_cents,
    feeCents: cardFee(s.amount_cents, settings),
  }));
  const firstTopUpAt = new Map<string, number>();
  for (const t of topUps) if (!firstTopUpAt.has(t.userId)) firstTopUpAt.set(t.userId, t.at);

  // --- What Lulu charged us for books it is making or made ---
  const printCosts: PrintCost[] = [];
  const canceledCharged = { count: 0, cents: 0 };
  for (const o of orders) {
    if (o.fulfillment !== "print") continue;
    if (o.canceled_at || o.status === "canceled") {
      if (o.paid_at && o.credits_applied > 0) {
        canceledCharged.count += 1;
        canceledCharged.cents += o.credits_applied;
      }
      continue;
    }
    if (!FULFILLED_STATUSES.has(o.status) || !o.paid_at) continue;
    printCosts.push({
      at: Date.parse(o.submitted_to_lulu_at ?? o.paid_at),
      sku: orderSku(o),
      cents: o.lulu_cost_cents ?? 0,
    });
  }

  const aiCosts: AiCost[] = aiDays.error
    ? []
    : (aiDays.data as AiDayRow[]).map((r) => ({
        at: Date.parse(`${r.day}T00:00:00Z`),
        sku: skuForOperation.get(r.operation) ?? UNMAPPED_AI,
        calls: Number(r.calls),
        cents: num(r.cost_usd) * 100,
      }));

  return {
    setupComplete,
    data: {
      sales,
      topUps,
      grants,
      aiCosts,
      printCosts,
      wallet,
      signups: profiles.map((p) => Date.parse(p.created_at)),
      firstTopUpAt,
      costs,
      settings,
      products,
      canceledCharged,
    },
  };
}

// --- Period maths -------------------------------------------------------------------------------

function inRange(at: number, from: number, to: number): boolean {
  return at >= from && at < to;
}

/** Each entered cost's share of [from, to): recurring costs accrue per day, one-time on their date. */
function operatingCosts(costs: FinanceCost[], from: number, to: number): Map<string, number> {
  const byCategory = new Map<string, number>();
  for (const c of costs) {
    const start = Date.parse(`${c.startsOn}T00:00:00Z`);
    let cents = 0;
    if (c.cadence === "one_time") {
      cents = inRange(start, from, to) ? c.amountCents : 0;
    } else {
      const end = c.endsOn ? Date.parse(`${c.endsOn}T00:00:00Z`) + DAY_MS : Number.POSITIVE_INFINITY;
      const overlap = Math.max(0, Math.min(to, end) - Math.max(from, start));
      const perDay = c.cadence === "monthly" ? (c.amountCents * 12) / 365 : c.amountCents / 365;
      cents = (overlap / DAY_MS) * perDay;
    }
    if (cents) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + cents);
  }
  return byCategory;
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

function sumBy<T>(rows: T[], from: number, to: number, at: (r: T) => number, value: (r: T) => number): number {
  let total = 0;
  for (const r of rows) if (inRange(at(r), from, to)) total += value(r);
  return total;
}

function productLines(d: Dataset, from: number, to: number): ProductLine[] {
  type Acc = { units: number; aiCalls: number; gross: number; promo: number; cost: number };
  const acc = new Map<string, Acc>();
  const get = (sku: string) => {
    let a = acc.get(sku);
    if (!a) {
      a = { units: 0, aiCalls: 0, gross: 0, promo: 0, cost: 0 };
      acc.set(sku, a);
    }
    return a;
  };

  for (const s of d.sales) {
    if (!inRange(s.at, from, to)) continue;
    const a = get(s.sku);
    a.units += s.units;
    a.gross += s.grossCents;
    a.promo += s.promoCents;
    // Non-AI, non-print items (the PDF) are costed at what the charge recorded.
    const group = d.products.get(s.sku)?.group ?? groupForSku(s.sku);
    if (group === "digital") {
      a.cost += s.units * (s.unitCogsCents ?? d.products.get(s.sku)?.unitCostCents ?? 0);
    }
  }
  for (const c of d.aiCosts) {
    if (!inRange(c.at, from, to)) continue;
    const a = get(c.sku);
    a.aiCalls += c.calls;
    a.cost += c.cents;
  }
  for (const p of d.printCosts) {
    if (inRange(p.at, from, to)) get(p.sku).cost += p.cents;
  }

  const order = [...d.products.keys()];
  return [...acc.entries()]
    .filter(([, a]) => a.units || a.gross || a.cost || a.aiCalls)
    .map(([key, a]): ProductLine => {
      const net = a.gross - a.promo;
      const contribution = net - a.cost;
      const info = d.products.get(key);
      return {
        key,
        name: info?.name ?? (key === "other" ? "Unmatched refunds" : key),
        group: info?.group ?? groupForSku(key),
        units: a.units,
        aiCalls: a.aiCalls,
        grossSalesCents: a.gross,
        promoCents: a.promo,
        netRevenueCents: net,
        variableCostCents: a.cost,
        contributionCents: contribution,
        contributionPct: pct(contribution, net),
        listMarginPct: pct(a.gross - a.cost, a.gross),
      };
    })
    .sort((x, y) => {
      const ix = order.indexOf(x.key);
      const iy = order.indexOf(y.key);
      return (ix < 0 ? 999 : ix) - (iy < 0 ? 999 : iy);
    });
}

function periodTotals(d: Dataset, from: number, to: number, lines = productLines(d, from, to)): PeriodTotals {
  const grossSales = lines.reduce((t, l) => t + l.grossSalesCents, 0);
  const promo = lines.reduce((t, l) => t + l.promoCents, 0);
  const netRevenue = grossSales - promo;

  const ai = sumBy(d.aiCosts, from, to, (c) => c.at, (c) => c.cents);
  const print = sumBy(d.printCosts, from, to, (c) => c.at, (c) => c.cents);
  const digital = lines.filter((l) => l.group === "digital").reduce((t, l) => t + l.variableCostCents, 0);
  const topUps = d.topUps.filter((t) => inRange(t.at, from, to));
  const topUpCents = topUps.reduce((t, x) => t + x.cents, 0);
  const fees = topUps.reduce((t, x) => t + x.feeCents, 0);

  const variableCosts: CostLine[] = [
    { key: "ai", label: "AI generation", cents: ai },
    { key: "print", label: "Printing & shipping (Lulu)", cents: print },
    { key: "digital", label: "Digital files", cents: digital },
    { key: "card_fees", label: "Card processing fees (est.)", cents: fees },
  ];
  const variableCostCents = ai + print + digital + fees;
  const contribution = netRevenue - variableCostCents;

  const opByCategory = operatingCosts(d.costs, from, to);
  const operatingCosts_: CostLine[] = COST_CATEGORIES.filter((c) => opByCategory.has(c.id)).map((c) => ({
    key: c.id,
    label: c.label,
    cents: opByCategory.get(c.id) ?? 0,
  }));
  const operating = operatingCosts_.reduce((t, c) => t + c.cents, 0);
  const operatingProfit = contribution - operating;

  // Cash: the PDF's notional cost never leaves the bank, so it is not cash out.
  const cashOut = fees + ai + print + operating;
  const payers = new Set(topUps.map((t) => t.userId));
  let firstTime = 0;
  for (const u of payers) {
    const first = d.firstTopUpAt.get(u);
    if (first != null && inRange(first, from, to)) firstTime += 1;
  }

  return {
    cash: {
      topUpsCents: topUpCents,
      topUpCount: topUps.length,
      cardFeesCents: fees,
      aiSpendCents: ai,
      printSpendCents: print,
      operatingCents: operating,
      cashInCents: topUpCents,
      cashOutCents: cashOut,
      netCashFlowCents: topUpCents - cashOut,
    },
    pnl: {
      grossSalesCents: grossSales,
      promoCents: promo,
      netRevenueCents: netRevenue,
      variableCosts,
      variableCostCents,
      contributionCents: contribution,
      contributionPct: pct(contribution, netRevenue),
      operatingCosts: operatingCosts_,
      operatingCostCents: operating,
      operatingProfitCents: operatingProfit,
      operatingMarginPct: pct(operatingProfit, netRevenue),
    },
    customers: {
      signups: d.signups.filter((at) => inRange(at, from, to)).length,
      payingCustomers: payers.size,
      firstTimePayers: firstTime,
      avgTopUpCents: topUps.length ? topUpCents / topUps.length : null,
      arppuCents: payers.size ? topUpCents / payers.size : null,
      promoGrantedCents: sumBy(d.grants, from, to, (g) => g.at, (g) => g.cents),
    },
  };
}

/** Net cash flow over [from, to) without building the whole period. */
function netCash(d: Dataset, from: number, to: number): number {
  return periodTotals(d, from, to).cash.netCashFlowCents;
}

function walletAt(d: Dataset, at: number): { paid: number; promo: number } {
  let lo = 0;
  let hi = d.wallet.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (d.wallet[mid].at < at) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? { paid: 0, promo: 0 } : { paid: d.wallet[found].paid, promo: d.wallet[found].promo };
}

// --- Ranges & series ----------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

export type RangeInput = { from?: string | null; to?: string | null };

/**
 * Inclusive YYYY-MM-DD dates → [from, to) in ms. Defaults to the last 30 days.
 * from = "all" starts at the first recorded activity (`firstActivity`).
 */
export function parseRange(
  input: RangeInput,
  firstActivity: number,
): { from: number; to: number } | { error: string } {
  const today = startOfUtcDay(Date.now());
  const toDay = input.to ? (DATE_RE.test(input.to) ? Date.parse(`${input.to}T00:00:00Z`) : NaN) : today;
  const fromDay = input.from === "all"
    ? Math.min(startOfUtcDay(firstActivity), toDay)
    : input.from
    ? DATE_RE.test(input.from)
      ? Date.parse(`${input.from}T00:00:00Z`)
      : NaN
    : toDay - 29 * DAY_MS;
  if (!Number.isFinite(fromDay) || !Number.isFinite(toDay)) return { error: "Dates must be YYYY-MM-DD" };
  if (fromDay > toDay) return { error: "Start date is after end date" };
  if (toDay - fromDay > 3 * 366 * DAY_MS) return { error: "Pick a range of three years or less" };
  return { from: fromDay, to: toDay + DAY_MS };
}

function buildSeries(d: Dataset, from: number, to: number, granularity: FinanceReport["range"]["granularity"]) {
  const points: SeriesPoint[] = [];
  let start = from;
  if (granularity === "week") {
    // Monday-start weeks; the first bucket is trimmed to the range.
    const dow = (new Date(from).getUTCDay() + 6) % 7;
    start = from - dow * DAY_MS;
  } else if (granularity === "month") {
    const f = new Date(from);
    start = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 1);
  }

  while (start < to) {
    let next: number;
    if (granularity === "day") next = start + DAY_MS;
    else if (granularity === "week") next = start + 7 * DAY_MS;
    else {
      const s = new Date(start);
      next = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1);
    }
    const a = Math.max(start, from);
    const b = Math.min(next, to);
    const t = periodTotals(d, a, b);
    const date = new Date(a);
    points.push({
      start: isoDay(a),
      label:
        granularity === "month"
          ? date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
          : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      cashInCents: t.cash.cashInCents,
      cashOutCents: t.cash.cashOutCents,
      netCashFlowCents: t.cash.netCashFlowCents,
      netRevenueCents: t.pnl.netRevenueCents,
      operatingProfitCents: t.pnl.operatingProfitCents,
    });
    start = next;
  }
  return points;
}

// --- Insights -----------------------------------------------------------------------------------

function usd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildInsights(
  report: Omit<FinanceReport, "insights" | "costs" | "settings" | "setupComplete" | "generatedAt">,
  d: Dataset,
): Insight[] {
  const out: Insight[] = [];
  const { current: cur, previous: prev, balances, unitEconomics: ue, products } = report;

  if (d.costs.length === 0) {
    out.push({
      tone: "info",
      title: "Add your fixed costs",
      detail:
        "Operating profit only counts what the app records (AI, Lulu, card fees). Add hosting, subscriptions, marketing and payroll below to see your true bottom line and break-even point.",
    });
  }

  if (cur.pnl.netRevenueCents > 0 || cur.pnl.operatingCostCents > 0 || cur.pnl.variableCostCents > 0) {
    if (cur.pnl.operatingProfitCents < 0) {
      out.push({
        tone: "warning",
        title: `Operating loss of ${usd(-cur.pnl.operatingProfitCents)} this period`,
        detail:
          ue.breakEvenMonthlyRevenueCents != null
            ? `At your current ${cur.pnl.contributionPct?.toFixed(0)}% contribution margin you need about ${usd(ue.breakEvenMonthlyRevenueCents)} of customer-funded revenue a month to break even; you're running at ${usd(ue.monthlyNetRevenueCents)}.`
            : "Each sale doesn't yet cover its own variable cost, so more volume won't close the gap. Fix unit economics (prices, free usage, promos) first.",
      });
    } else {
      out.push({
        tone: "good",
        title: `Operating profit of ${usd(cur.pnl.operatingProfitCents)}`,
        detail: `${cur.pnl.operatingMarginPct?.toFixed(0) ?? "—"}% operating margin on ${usd(cur.pnl.netRevenueCents)} of net revenue.`,
      });
    }
  }

  if (cur.pnl.grossSalesCents > 0) {
    const promoShare = cur.pnl.promoCents / cur.pnl.grossSalesCents;
    if (promoShare >= 0.5) {
      out.push({
        tone: "warning",
        title: `${Math.round(promoShare * 100)}% of sales were paid with promo credit`,
        detail: `${usd(cur.pnl.promoCents)} of the ${usd(cur.pnl.grossSalesCents)} customers spent was credit you gave away, so it brought in no cash but still cost AI and printing. Watch whether promo users go on to top up (${cur.customers.firstTimePayers} first-time payer${cur.customers.firstTimePayers === 1 ? "" : "s"} this period).`,
      });
    }
  }

  const losing = products.filter((p) => p.grossSalesCents > 0 && p.listMarginPct != null && p.listMarginPct < 0);
  if (losing.length) {
    out.push({
      tone: "critical",
      title: `Priced below cost: ${losing.map((p) => p.name).join(", ")}`,
      detail:
        "Even at full list price these lines cost more to serve than they bring in (counting every AI call, including free edits and retries). Raise the cost basis or markup on the Prices page, or cut the free allowance.",
    });
  }

  const unsold = products.filter((p) => p.grossSalesCents <= 0 && p.variableCostCents > 0);
  const unsoldCents = unsold.reduce((t, p) => t + p.variableCostCents, 0);
  if (unsoldCents >= 1) {
    out.push({
      tone: "info",
      title: `${usd(unsoldCents)} of AI usage wasn't charged to anyone`,
      detail: `${unsold.map((p) => p.name).join(", ")}. That's fine as a deliberate free feature, but it's a cost of acquiring and keeping users and belongs in your pricing decisions.`,
    });
  }

  for (const p of products) {
    if (p.group !== "ai" || p.units < 5 || p.aiCalls === 0) continue;
    const callsPerSale = p.aiCalls / p.units;
    if (callsPerSale >= 1.4) {
      out.push({
        tone: "info",
        title: `${p.name}: ${callsPerSale.toFixed(1)} AI calls per sale`,
        detail:
          "Each charged sale is paying for extra calls (retries, failures or free uses). The cost basis on the Prices page should reflect cost per sale, not cost per call.",
      });
    }
  }

  if (cur.cash.topUpsCents > 0) {
    const feeShare = cur.cash.cardFeesCents / cur.cash.topUpsCents;
    if (feeShare >= 0.05) {
      out.push({
        tone: "warning",
        title: `Card fees ate ${(feeShare * 100).toFixed(1)}% of top-ups`,
        detail: `The average top-up is ${usd(cur.customers.avgTopUpCents ?? 0)}, so the fixed ${usd(d.settings.cardFeeFixedCents)} per charge hurts. Nudge customers toward larger top-ups (e.g. a $10 minimum or bonus credit on $20+).`,
      });
    }
  }

  if (d.canceledCharged.count > 0) {
    out.push({
      tone: "warning",
      title: `${d.canceledCharged.count} canceled print order${d.canceledCharged.count === 1 ? "" : "s"} still charged`,
      detail: `${usd(d.canceledCharged.cents)} was taken from wallets for orders that were later canceled. It's left out of sales, but canceling doesn't refund the wallet; if these customers should get it back, add it on the Users page.`,
    });
  }

  if (balances.paidWalletCents > 0) {
    out.push({
      tone: "info",
      title: `${usd(balances.paidWalletCents)} of customers' prepaid money is unspent`,
      detail:
        "This is cash you've collected but not yet earned (deferred revenue). Treat it as owed to customers, not as profit.",
    });
  }
  if (balances.promoWalletCents > 0) {
    out.push({
      tone: "info",
      title: `${usd(balances.promoWalletCents)} of promo credit is outstanding`,
      detail: `No cash will come in for it, and redeeming it will likely cost about ${usd(balances.promoCostExposureCents)} in AI and printing at today's cost ratio.`,
    });
  }

  if (prev.pnl.netRevenueCents > 0) {
    const change = (cur.pnl.netRevenueCents - prev.pnl.netRevenueCents) / prev.pnl.netRevenueCents;
    out.push({
      tone: change >= 0 ? "good" : "warning",
      title: `Net revenue ${change >= 0 ? "up" : "down"} ${Math.abs(change * 100).toFixed(0)}% on the previous period`,
      detail: `${usd(cur.pnl.netRevenueCents)} vs ${usd(prev.pnl.netRevenueCents)}.`,
    });
  }

  if (ue.runwayMonths != null && ue.runwayMonths < 6) {
    out.push({
      tone: ue.runwayMonths < 3 ? "critical" : "warning",
      title: `About ${ue.runwayMonths.toFixed(1)} months of runway`,
      detail: `At the last 90 days' burn of ${usd(ue.monthlyBurnCents ?? 0)} a month, cash on hand runs out in roughly ${ue.runwayMonths.toFixed(1)} months.`,
    });
  }

  const rank = { critical: 0, warning: 1, good: 2, info: 3 } as const;
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// --- Report -------------------------------------------------------------------------------------

export async function getFinanceReport(input: RangeInput): Promise<ApiResult<FinanceReport>> {
  // Validate the dates before touching the database.
  const check = parseRange(input, Date.now());
  if ("error" in check) return { data: null, error: { message: check.error } };

  let loaded: Awaited<ReturnType<typeof loadDataset>>;
  try {
    // Every AI cost on record: cash on hand and all-time ratios look past the range.
    loaded = await loadDataset(0, Date.now() + DAY_MS);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load financial data";
    log("error", "finance report failed", { message });
    return { data: null, error: { message } };
  }
  const d = loaded.data;

  const firstActivity = Math.min(
    Date.now(),
    d.signups[0] ?? Infinity,
    d.wallet[0]?.at ?? Infinity,
    d.aiCosts[0]?.at ?? Infinity,
    d.topUps[0]?.at ?? Infinity,
  );
  const range = parseRange(input, firstActivity);
  if ("error" in range) return { data: null, error: { message: range.error } };
  const { from, to } = range;
  const span = to - from;
  const prevFrom = from - span;
  const burnFrom = to - 90 * DAY_MS;

  const products = productLines(d, from, to);
  const current = periodTotals(d, from, to, products);
  const previous = periodTotals(d, prevFrom, from);
  const days = Math.round(span / DAY_MS);
  const granularity: FinanceReport["range"]["granularity"] = days <= 45 ? "day" : days <= 200 ? "week" : "month";

  const wallet = walletAt(d, to);
  // Cost ratio across all history, so a quiet period doesn't zero the estimate.
  const allTime = periodTotals(d, 0, Number.MAX_SAFE_INTEGER);
  const allVariableExFees = allTime.pnl.variableCostCents - allTime.cash.cardFeesCents;
  const costRatio = allTime.pnl.grossSalesCents > 0 ? allVariableExFees / allTime.pnl.grossSalesCents : 0;

  const s = d.settings;
  let cashOnHand: number | null = null;
  if (s.openingCashCents != null && s.openingCashOn) {
    const openedAt = Date.parse(`${s.openingCashOn}T00:00:00Z`);
    if (openedAt <= to) cashOnHand = s.openingCashCents + netCash(d, openedAt, to);
  }

  const burnNet = netCash(d, burnFrom, to);
  const monthlyBurn = burnNet < 0 ? (-burnNet / 90) * 30 : null;
  const contributionRatio = current.pnl.netRevenueCents > 0 ? current.pnl.contributionCents / current.pnl.netRevenueCents : 0;
  const monthlyOperating = (current.pnl.operatingCostCents / days) * 30;

  const base = {
    range: { from: isoDay(from), to: isoDay(to - DAY_MS), days, granularity },
    previousRange: { from: isoDay(prevFrom), to: isoDay(from - DAY_MS) },
    current,
    previous,
    products,
    series: buildSeries(d, from, to, granularity),
    balances: {
      paidWalletCents: Math.max(0, wallet.paid),
      promoWalletCents: Math.max(0, wallet.promo),
      promoCostExposureCents: Math.max(0, wallet.promo) * costRatio,
      cashOnHandCents: cashOnHand,
    },
    unitEconomics: {
      monthlyOperatingCents: monthlyOperating,
      breakEvenMonthlyRevenueCents: contributionRatio > 0 ? monthlyOperating / contributionRatio : null,
      monthlyNetRevenueCents: (current.pnl.netRevenueCents / days) * 30,
      monthlyBurnCents: monthlyBurn,
      runwayMonths: cashOnHand != null && monthlyBurn ? Math.max(0, cashOnHand / monthlyBurn) : null,
      totalUsers: d.signups.length,
      everPaidUsers: d.firstTopUpAt.size,
    },
  } satisfies Omit<FinanceReport, "insights" | "costs" | "settings" | "setupComplete" | "generatedAt">;

  return {
    data: {
      ...base,
      insights: buildInsights(base, d),
      costs: d.costs,
      settings: d.settings,
      setupComplete: loaded.setupComplete,
      generatedAt: new Date().toISOString(),
    },
    error: null,
  };
}

// --- Costs & settings ---------------------------------------------------------------------------

const CATEGORY_IDS = new Set<string>(COST_CATEGORIES.map((c) => c.id));
const CADENCE_IDS = new Set<string>(COST_CADENCES.map((c) => c.id));

function trimOrNull(value: unknown, max: number): string | null | { error: string } {
  if (value == null) return null;
  if (typeof value !== "string") return { error: "must be text" };
  const t = value.trim();
  if (t.length > max) return { error: `must be ${max} characters or fewer` };
  return t || null;
}

/** Validates a cost from the request body; returns the row to write or an error message. */
export function parseCostInput(body: Record<string, unknown>): FinanceCostInput | { error: string } {
  const name = trimOrNull(body.name, 120);
  if (name == null || typeof name === "object") return { error: "Name is required (120 characters max)" };
  const vendor = trimOrNull(body.vendor, 120);
  if (vendor && typeof vendor === "object") return { error: `Vendor ${vendor.error}` };
  const notes = trimOrNull(body.notes, 500);
  if (notes && typeof notes === "object") return { error: `Notes ${notes.error}` };
  if (typeof body.category !== "string" || !CATEGORY_IDS.has(body.category)) return { error: "Pick a category" };
  if (typeof body.cadence !== "string" || !CADENCE_IDS.has(body.cadence)) return { error: "Pick how often it's paid" };
  const amount = body.amountCents;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || amount > 100_000_000) {
    return { error: "Amount must be between $0 and $1,000,000" };
  }
  if (typeof body.startsOn !== "string" || !DATE_RE.test(body.startsOn)) return { error: "Start date is required" };
  let endsOn: string | null = null;
  if (body.endsOn != null && body.endsOn !== "") {
    if (typeof body.endsOn !== "string" || !DATE_RE.test(body.endsOn)) return { error: "End date must be a date" };
    if (body.endsOn < body.startsOn) return { error: "End date is before the start date" };
    endsOn = body.endsOn;
  }
  return {
    name,
    vendor: vendor as string | null,
    notes: notes as string | null,
    category: body.category as FinanceCostInput["category"],
    cadence: body.cadence as FinanceCostInput["cadence"],
    amountCents: amount,
    startsOn: body.startsOn,
    endsOn,
  };
}

function costRow(input: FinanceCostInput, userId: string) {
  return {
    name: input.name,
    vendor: input.vendor,
    category: input.category,
    cadence: input.cadence,
    amount_cents: input.amountCents,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    notes: input.notes,
    updated_by: userId,
  };
}

const COST_COLUMNS = "id, name, vendor, category, cadence, amount_cents, starts_on, ends_on, notes, updated_at";

export async function createFinanceCost(input: FinanceCostInput, userId: string): Promise<ApiResult<FinanceCost>> {
  const { data, error } = await getSupabaseAdmin()
    .from("finance_costs")
    .insert({ ...costRow(input, userId), created_by: userId })
    .select(COST_COLUMNS)
    .single();
  if (error) return { data: null, error: { message: error.message } };
  return { data: toCost(data as CostRow), error: null };
}

export async function updateFinanceCost(
  id: string,
  input: FinanceCostInput,
  userId: string,
): Promise<ApiResult<FinanceCost>> {
  const { data, error } = await getSupabaseAdmin()
    .from("finance_costs")
    .update(costRow(input, userId))
    .eq("id", id)
    .select(COST_COLUMNS)
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!data) return { data: null, error: { message: "Cost not found", code: "NOT_FOUND" } };
  return { data: toCost(data as CostRow), error: null };
}

export async function deleteFinanceCost(id: string): Promise<ApiResult<{ id: string }>> {
  const { data, error } = await getSupabaseAdmin().from("finance_costs").delete().eq("id", id).select("id");
  if (error) return { data: null, error: { message: error.message } };
  if (!data?.length) return { data: null, error: { message: "Cost not found", code: "NOT_FOUND" } };
  return { data: { id }, error: null };
}

export function parseSettingsInput(body: Record<string, unknown>): Omit<FinanceSettings, "updatedAt"> | { error: string } {
  const { cardFeePct, cardFeeFixedCents, openingCashCents, openingCashOn } = body;
  if (typeof cardFeePct !== "number" || !Number.isFinite(cardFeePct) || cardFeePct < 0 || cardFeePct > 20) {
    return { error: "Card fee % must be between 0 and 20" };
  }
  if (
    typeof cardFeeFixedCents !== "number" ||
    !Number.isInteger(cardFeeFixedCents) ||
    cardFeeFixedCents < 0 ||
    cardFeeFixedCents > 1000
  ) {
    return { error: "Fixed card fee must be between $0 and $10" };
  }
  const hasCash = openingCashCents != null && openingCashCents !== "";
  const hasDate = openingCashOn != null && openingCashOn !== "";
  if (hasCash !== hasDate) return { error: "Enter both the cash balance and the date it was on, or neither" };
  if (hasCash) {
    if (typeof openingCashCents !== "number" || !Number.isInteger(openingCashCents)) {
      return { error: "Cash balance must be a dollar amount" };
    }
    if (typeof openingCashOn !== "string" || !DATE_RE.test(openingCashOn)) return { error: "Balance date is required" };
  }
  return {
    cardFeePct: Math.round(cardFeePct * 1000) / 1000,
    cardFeeFixedCents,
    openingCashCents: hasCash ? (openingCashCents as number) : null,
    openingCashOn: hasCash ? (openingCashOn as string) : null,
  };
}

export async function updateFinanceSettings(
  input: Omit<FinanceSettings, "updatedAt">,
  userId: string,
): Promise<ApiResult<FinanceSettings>> {
  const { data, error } = await getSupabaseAdmin()
    .from("finance_settings")
    .update({
      card_fee_pct: input.cardFeePct,
      card_fee_fixed_cents: input.cardFeeFixedCents,
      opening_cash_cents: input.openingCashCents,
      opening_cash_on: input.openingCashOn,
      updated_by: userId,
    })
    .eq("id", true)
    .select("card_fee_pct, card_fee_fixed_cents, opening_cash_cents, opening_cash_on, updated_at")
    .single();
  if (error) return { data: null, error: { message: error.message } };
  return { data: toSettings(data as SettingsRow), error: null };
}
