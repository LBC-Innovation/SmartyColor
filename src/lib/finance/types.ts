/**
 * The financials dashboard (/admin/finance). All money is integer-ish USD cents
 * (AI costs carry sub-cent precision, so amounts are plain numbers, not ints).
 *
 * Two lenses on the same business:
 *   - Cash: money that actually moved. In = card top-ups. Out = card fees, the AI
 *     provider, Lulu, and the operating costs entered on the page.
 *   - Profit (accrual): revenue is earned when wallet money is spent on something,
 *     not when it is topped up. Promo credit spent is a discount, not revenue.
 */

export const FINANCE_VIEW_PERMISSION = "finance:view";
export const FINANCE_MANAGE_PERMISSION = "finance:manage";

export const COST_CATEGORIES = [
  { id: "hosting", label: "Hosting & infrastructure" },
  { id: "software", label: "Software & subscriptions" },
  { id: "ai_platform", label: "AI platform plans" },
  { id: "marketing", label: "Marketing & ads" },
  { id: "payroll", label: "Payroll & contractors" },
  { id: "professional", label: "Legal, accounting & admin" },
  { id: "other", label: "Other" },
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number]["id"];

export const COST_CADENCES = [
  { id: "monthly", label: "Monthly" },
  { id: "annual", label: "Yearly" },
  { id: "one_time", label: "One-time" },
] as const;

export type CostCadence = (typeof COST_CADENCES)[number]["id"];

export type FinanceCost = {
  id: string;
  name: string;
  vendor: string | null;
  category: CostCategory;
  cadence: CostCadence;
  amountCents: number;
  /** YYYY-MM-DD */
  startsOn: string;
  /** YYYY-MM-DD, inclusive; null while it is still running. */
  endsOn: string | null;
  notes: string | null;
  updatedAt: string;
};

export type FinanceCostInput = Omit<FinanceCost, "id" | "updatedAt">;

export type FinanceSettings = {
  cardFeePct: number;
  cardFeeFixedCents: number;
  openingCashCents: number | null;
  openingCashOn: string | null;
  updatedAt: string | null;
};

/** One line in the contribution-margin table. */
export type ProductLine = {
  key: string;
  name: string;
  group: "ai" | "digital" | "print" | "other";
  /** Units sold, net of refunds. */
  units: number;
  /** AI calls made for this line (sold, free, retried and failed alike). */
  aiCalls: number;
  /** What the wallet was charged, net of refunds. */
  grossSalesCents: number;
  /** The part of gross sales paid for with promo credit. */
  promoCents: number;
  /** Gross sales minus promo: revenue funded by customers' own money. */
  netRevenueCents: number;
  /** AI, printing + shipping, or file costs actually incurred for this line. */
  variableCostCents: number;
  /** Net revenue minus variable cost. */
  contributionCents: number;
  /** Contribution ÷ net revenue; null with no revenue. */
  contributionPct: number | null;
  /** Gross sales minus variable cost ÷ gross sales: the margin the list price earns before promos. */
  listMarginPct: number | null;
};

export type CostLine = { key: string; label: string; cents: number };

export type PeriodTotals = {
  cash: {
    topUpsCents: number;
    topUpCount: number;
    cardFeesCents: number;
    aiSpendCents: number;
    printSpendCents: number;
    operatingCents: number;
    cashInCents: number;
    cashOutCents: number;
    netCashFlowCents: number;
  };
  pnl: {
    grossSalesCents: number;
    promoCents: number;
    netRevenueCents: number;
    variableCosts: CostLine[];
    variableCostCents: number;
    contributionCents: number;
    contributionPct: number | null;
    operatingCosts: CostLine[];
    operatingCostCents: number;
    operatingProfitCents: number;
    operatingMarginPct: number | null;
  };
  customers: {
    signups: number;
    payingCustomers: number;
    firstTimePayers: number;
    avgTopUpCents: number | null;
    /** Top-ups per paying customer. */
    arppuCents: number | null;
    promoGrantedCents: number;
  };
};

export type SeriesPoint = {
  /** Bucket start, YYYY-MM-DD (UTC). */
  start: string;
  label: string;
  cashInCents: number;
  cashOutCents: number;
  netCashFlowCents: number;
  netRevenueCents: number;
  operatingProfitCents: number;
};

export type Insight = {
  tone: "good" | "warning" | "critical" | "info";
  title: string;
  detail: string;
};

export type FinanceReport = {
  range: { from: string; to: string; days: number; granularity: "day" | "week" | "month" };
  previousRange: { from: string; to: string };
  current: PeriodTotals;
  previous: PeriodTotals;
  products: ProductLine[];
  series: SeriesPoint[];
  balances: {
    /** At the end of the range. Customers' own unspent money: owed to them in product. */
    paidWalletCents: number;
    /** Unspent promo credit: no cash came in for it, but it will cost us when it is used. */
    promoWalletCents: number;
    /** promoWallet × the variable-cost share of sales: what redeeming it will likely cost. */
    promoCostExposureCents: number;
    cashOnHandCents: number | null;
  };
  unitEconomics: {
    /** Operating costs normalised to 30 days, from the range. */
    monthlyOperatingCents: number;
    /** Net revenue needed per 30 days to cover operating costs at the current contribution margin. */
    breakEvenMonthlyRevenueCents: number | null;
    /** Net revenue normalised to 30 days, from the range. */
    monthlyNetRevenueCents: number;
    /** Average monthly net cash outflow over the last 90 days (null when cash-positive). */
    monthlyBurnCents: number | null;
    runwayMonths: number | null;
    totalUsers: number;
    everPaidUsers: number;
  };
  insights: Insight[];
  costs: FinanceCost[];
  settings: FinanceSettings;
  /** False until migration 0023 is applied; costs and settings are then empty/defaults. */
  setupComplete: boolean;
  generatedAt: string;
};
