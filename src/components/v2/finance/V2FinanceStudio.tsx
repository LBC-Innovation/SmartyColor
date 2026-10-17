"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { ADMIN_CONTENT_CLASS, V2AdminToolbar } from "@/components/v2/auth/V2AdminSubNav";
import { V2FinanceCashChart } from "@/components/v2/finance/V2FinanceCashChart";
import { V2FinanceCosts, V2FinanceSettingsForm } from "@/components/v2/finance/V2FinanceCosts";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";
import {
  FINANCE_MANAGE_PERMISSION,
  type CostLine,
  type FinanceReport,
  type Insight,
  type PeriodTotals,
  type ProductLine,
} from "@/lib/finance/types";

const DAY_MS = 86_400_000;

type PresetId = "30d" | "90d" | "mtd" | "last_month" | "ytd" | "12m" | "all" | "custom";

const PRESETS: Array<{ id: Exclude<PresetId, "custom">; label: string }> = [
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "mtd", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "ytd", label: "Year to date" },
  { id: "12m", label: "12 months" },
  { id: "all", label: "All time" },
];

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Preset → inclusive UTC dates. */
function presetRange(id: Exclude<PresetId, "custom">): { from: string; to: string } {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (id) {
    case "30d":
      return { from: iso(today - 29 * DAY_MS), to: iso(today) };
    case "90d":
      return { from: iso(today - 89 * DAY_MS), to: iso(today) };
    case "mtd":
      return { from: iso(Date.UTC(y, m, 1)), to: iso(today) };
    case "last_month":
      return { from: iso(Date.UTC(y, m - 1, 1)), to: iso(Date.UTC(y, m, 0)) };
    case "ytd":
      return { from: iso(Date.UTC(y, 0, 1)), to: iso(today) };
    case "12m":
      return { from: iso(today - 364 * DAY_MS), to: iso(today) };
    case "all":
      return { from: "all", to: iso(today) };
  }
}

/** Sub-cent AI amounts round to zero; never show "-$0.00". */
function money(cents: number): string {
  return formatCredits(Math.abs(cents) < 0.5 ? 0 : cents);
}

function pct(value: number | null, digits = 0): string {
  return value == null ? "—" : `${value.toFixed(digits)}%`;
}

function signed(cents: number): string {
  return `${cents >= 0.5 ? "+" : ""}${money(cents)}`;
}

export function V2FinanceStudio() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes(FINANCE_MANAGE_PERMISSION) ?? false;
  const [preset, setPreset] = useState<PresetId>("30d");
  const [range, setRange] = useState(() => presetRange("30d"));
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: { from: string; to: string }) => {
    setLoading(true);
    const result = await api.adminGetFinance(r);
    setLoading(false);
    if (api.isError(result)) {
      setError(result.error.message);
    } else {
      setError(null);
      setReport(result.data);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api.adminGetFinance(range).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (api.isError(result)) setError(result.error.message);
      else {
        setError(null);
        setReport(result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [range]);

  function choose(id: Exclude<PresetId, "custom">) {
    setPreset(id);
    setLoading(true);
    setRange(presetRange(id));
  }

  const reload = () => void load(range);

  return (
    <V2StudioFrame>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <V2AdminToolbar />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <div className={`${ADMIN_CONTENT_CLASS} py-6 sm:py-8`}>
            <header className="mb-5">
              <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">Financials</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-v2-muted sm:text-base">
                Where the money comes from and where it goes. Cash shows what actually moved through the bank;
                profit counts revenue when customers spend their wallet, not when they top it up.
              </p>
            </header>

            <div className="mb-6 flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1 rounded-xl bg-v2-bg-subtle p-1" role="group" aria-label="Period">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choose(p.id)}
                    aria-pressed={preset === p.id}
                    className={cn(
                      "h-8 rounded-lg px-3 text-xs font-semibold transition-colors",
                      preset === p.id ? "bg-white text-v2-primary shadow-sm" : "text-v2-navy hover:text-v2-ink",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-v2-muted">
                <input
                  type="date"
                  aria-label="From"
                  className="v2-input h-8 w-[9.5rem] py-0 text-xs"
                  value={report && range.from === "all" ? report.range.from : range.from}
                  max={range.to}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setPreset("custom");
                    setLoading(true);
                    setRange((r) => ({ ...r, from: e.target.value }));
                  }}
                />
                <span>to</span>
                <input
                  type="date"
                  aria-label="To"
                  className="v2-input h-8 w-[9.5rem] py-0 text-xs"
                  value={range.to}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setPreset("custom");
                    setLoading(true);
                    setRange((r) => ({ ...r, to: e.target.value }));
                  }}
                />
              </div>
              <button type="button" className="v2-btn-sm text-v2-muted" onClick={reload} aria-label="Refresh">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
              </button>
            </div>

            {error ? (
              <p className="v2-panel mb-6 p-4 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            {!report ? (
              loading ? (
                <div className="flex min-h-[30vh] items-center justify-center text-v2-muted">
                  <Loader2 className="h-8 w-8 animate-spin text-v2-primary" aria-label="Loading" />
                </div>
              ) : null
            ) : (
              <div className={cn("space-y-8 transition-opacity", loading && "opacity-60")}>
                {!report.setupComplete ? (
                  <p className="v2-panel p-4 text-sm text-amber-800" role="status">
                    The finance tables aren&apos;t set up yet (migration 0023), so entered costs and assumptions are
                    unavailable. Everything the app records is still shown.
                  </p>
                ) : null}

                <KpiRow report={report} />

                {report.insights.length ? (
                  <section>
                    <p className="v2-section-title mb-3">What to pay attention to</p>
                    <InsightTable insights={report.insights} />
                  </section>
                ) : null}

                <section>
                  <p className="v2-section-title mb-1">Cash in vs. cash out</p>
                  <p className="mb-3 text-xs text-v2-muted">
                    By {report.range.granularity}, {report.range.from} to {report.range.to} (UTC). Cash in is card
                    top-ups; cash out is card fees, AI, Lulu and your entered costs.
                  </p>
                  <div className="v2-panel p-4 sm:p-5">
                    <V2FinanceCashChart series={report.series} />
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <p className="v2-section-title mb-3">Profit & loss</p>
                    <ProfitAndLoss current={report.current} previous={report.previous} />
                  </div>
                  <div>
                    <p className="v2-section-title mb-3">Cash flow</p>
                    <CashFlow current={report.current} previous={report.previous} report={report} />
                  </div>
                </section>

                <section>
                  <p className="v2-section-title mb-1">Contribution margin by product</p>
                  <p className="mb-3 max-w-3xl text-xs leading-relaxed text-v2-muted">
                    What each product earns after the costs it causes. Variable cost counts every AI call made for the
                    product, including free edits, retries and failures, and Lulu&apos;s full charge (printing,
                    shipping, tax) for books. List margin is the margin at full price before promo credit.
                  </p>
                  <ProductTable products={report.products} />
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <p className="v2-section-title mb-3">Balances & obligations</p>
                    <Balances report={report} />
                  </div>
                  <div>
                    <p className="v2-section-title mb-3">Customers & unit economics</p>
                    <UnitEconomics report={report} />
                  </div>
                </section>

                {report.setupComplete ? (
                  <section className="space-y-4">
                    <p className="v2-section-title">Costs & assumptions</p>
                    <V2FinanceCosts costs={report.costs} canManage={canManage} onChanged={reload} />
                    <V2FinanceSettingsForm
                      key={report.settings.updatedAt ?? "defaults"}
                      settings={report.settings}
                      canManage={canManage}
                      onSaved={reload}
                    />
                  </section>
                ) : null}

                <Methodology />
              </div>
            )}
          </div>
        </main>
      </div>
    </V2StudioFrame>
  );
}

// --- KPIs ---------------------------------------------------------------------------------------

function KpiRow({ report }: { report: FinanceReport }) {
  const c = report.current;
  const p = report.previous;
  const cash = report.balances.cashOnHandCents;
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Kpi
        label="Cash in"
        value={money(c.cash.cashInCents)}
        sub={`${c.cash.topUpCount} top-up${c.cash.topUpCount === 1 ? "" : "s"}`}
        delta={c.cash.cashInCents - p.cash.cashInCents}
      />
      <Kpi
        label="Net cash flow"
        value={money(c.cash.netCashFlowCents)}
        sub={`${money(c.cash.cashOutCents)} out`}
        delta={c.cash.netCashFlowCents - p.cash.netCashFlowCents}
        negative={c.cash.netCashFlowCents < 0}
      />
      <Kpi
        label="Net revenue"
        value={money(c.pnl.netRevenueCents)}
        sub={`${money(c.pnl.grossSalesCents)} sales, ${money(c.pnl.promoCents)} promo`}
        delta={c.pnl.netRevenueCents - p.pnl.netRevenueCents}
      />
      <Kpi
        label="Contribution margin"
        value={money(c.pnl.contributionCents)}
        sub={`${pct(c.pnl.contributionPct)} of net revenue`}
        delta={c.pnl.contributionCents - p.pnl.contributionCents}
        negative={c.pnl.contributionCents < 0}
      />
      <Kpi
        label="Operating profit"
        value={money(c.pnl.operatingProfitCents)}
        sub={`${pct(c.pnl.operatingMarginPct)} margin`}
        delta={c.pnl.operatingProfitCents - p.pnl.operatingProfitCents}
        negative={c.pnl.operatingProfitCents < 0}
      />
      {cash != null ? (
        <Kpi
          label="Cash on hand"
          value={money(cash)}
          sub={
            report.unitEconomics.runwayMonths != null
              ? `${report.unitEconomics.runwayMonths.toFixed(1)} months of runway`
              : "Cash-positive over 90 days"
          }
          negative={cash < 0}
        />
      ) : (
        <Kpi
          label="Owed to customers"
          value={money(report.balances.paidWalletCents)}
          sub="Prepaid wallet balance, unearned"
        />
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  delta,
  negative,
}: {
  label: string;
  value: string;
  sub: string;
  delta?: number;
  negative?: boolean;
}) {
  return (
    <div className="v2-panel p-4">
      <p className="text-xs font-semibold text-v2-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums sm:text-2xl", negative ? "text-red-700" : "text-v2-ink")}>{value}</p>
      <p className="mt-0.5 text-xs text-v2-muted">{sub}</p>
      {delta != null ? (
        <p className="mt-1 text-xs tabular-nums text-v2-muted">
          <span className={cn("font-semibold", delta > 0 ? "text-v2-success-text" : delta < 0 ? "text-red-700" : "")}>
            {signed(delta)}
          </span>{" "}
          vs. previous period
        </p>
      ) : null}
    </div>
  );
}

const TONE: Record<Insight["tone"], { icon: typeof Info; className: string; label: string }> = {
  critical: { icon: AlertOctagon, className: "border-red-200 bg-red-50 text-red-800", label: "Critical" },
  warning: { icon: AlertTriangle, className: "border-amber-200 bg-amber-50 text-amber-900", label: "Watch" },
  good: { icon: CheckCircle2, className: "border-v2-success-border bg-v2-success-bg text-v2-success-text", label: "Good" },
  info: { icon: Info, className: "border-gray-200 bg-white text-v2-navy", label: "Note" },
};

/** Most urgent first. */
const TONE_ORDER: Insight["tone"][] = ["critical", "warning", "info", "good"];

function InsightTable({ insights }: { insights: Insight[] }) {
  const sorted = [...insights].sort((a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone));
  return (
    // On phones the details sit under each title instead of in a column of their own.
    <div className="v2-panel overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-v2-muted">
            <th className="w-28 px-4 py-2.5 text-left font-semibold">Status</th>
            <th className="px-2 py-2.5 text-left font-semibold sm:w-1/3">What</th>
            <th className="hidden px-4 py-2.5 text-left font-semibold sm:table-cell">Details</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((insight, i) => {
            const tone = TONE[insight.tone];
            const Icon = tone.icon;
            return (
              <tr key={i} className="border-b border-gray-100 align-top last:border-b-0">
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold",
                      tone.className,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {tone.label}
                  </span>
                </td>
                <td className="py-2.5 pr-4 pl-2 sm:pr-2">
                  <p className="font-semibold text-v2-ink">{insight.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-v2-navy sm:hidden">{insight.detail}</p>
                </td>
                <td className="hidden px-4 py-2.5 text-xs leading-relaxed text-v2-navy sm:table-cell">
                  {insight.detail}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Statements ---------------------------------------------------------------------------------

type StatementRow =
  | { kind: "line"; label: ReactNode; current: number; previous: number; indent?: boolean; negate?: boolean }
  | { kind: "total"; label: ReactNode; current: number; previous: number; note?: string };

function Statement({ rows, base }: { rows: StatementRow[]; base?: number }) {
  return (
    <div className="v2-panel overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-v2-muted">
            <th className="px-4 pt-3 pb-2 text-left font-semibold" />
            <th className="px-2 pt-3 pb-2 text-right font-semibold">This period</th>
            <th className="px-2 pt-3 pb-2 text-right font-semibold">Previous</th>
            {base != null ? <th className="px-4 pt-3 pb-2 text-right font-semibold">% of rev.</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isTotal = r.kind === "total";
            const sign = r.kind === "line" && r.negate ? -1 : 1;
            const cur = r.current * sign;
            const prev = r.previous * sign;
            return (
              <tr key={i} className={cn(isTotal ? "border-t border-gray-200 font-semibold text-v2-ink" : "text-v2-navy")}>
                <td className={cn("px-4 py-1.5", r.kind === "line" && r.indent && "pl-8")}>
                  {r.label}
                  {isTotal && r.note ? <span className="ml-1.5 text-xs font-normal text-v2-muted">{r.note}</span> : null}
                </td>
                <td className={cn("px-2 py-1.5 text-right", cur < 0 && "text-red-700")}>{money(cur)}</td>
                <td className={cn("px-2 py-1.5 text-right text-v2-muted", prev < 0 && isTotal && "text-red-700")}>
                  {money(prev)}
                </td>
                {base != null ? (
                  <td className="px-4 py-1.5 text-right text-xs text-v2-muted">
                    {base > 0 ? pct((cur / base) * 100) : "—"}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function costRows(current: CostLine[], previous: CostLine[]): StatementRow[] {
  const keys = [...new Set([...current, ...previous].map((c) => c.key))];
  return keys
    .map((key) => {
      const cur = current.find((c) => c.key === key);
      const prev = previous.find((c) => c.key === key);
      return {
        kind: "line" as const,
        label: cur?.label ?? prev?.label ?? key,
        current: cur?.cents ?? 0,
        previous: prev?.cents ?? 0,
        indent: true,
        negate: true,
      };
    })
    .filter((r) => Math.abs(r.current) >= 0.5 || Math.abs(r.previous) >= 0.5);
}

function ProfitAndLoss({ current: c, previous: p }: { current: PeriodTotals; previous: PeriodTotals }) {
  const rows: StatementRow[] = [
    { kind: "line", label: "Gross sales", current: c.pnl.grossSalesCents, previous: p.pnl.grossSalesCents },
    { kind: "line", label: "Less promo credit redeemed", current: c.pnl.promoCents, previous: p.pnl.promoCents, negate: true },
    { kind: "total", label: "Net revenue", current: c.pnl.netRevenueCents, previous: p.pnl.netRevenueCents },
    ...costRows(c.pnl.variableCosts, p.pnl.variableCosts),
    {
      kind: "total",
      label: "Contribution margin",
      current: c.pnl.contributionCents,
      previous: p.pnl.contributionCents,
    },
    ...costRows(c.pnl.operatingCosts, p.pnl.operatingCosts),
    ...(c.pnl.operatingCosts.length || p.pnl.operatingCosts.length
      ? []
      : [
          {
            kind: "line" as const,
            label: <span className="text-v2-muted">No fixed costs entered</span>,
            current: 0,
            previous: 0,
            indent: true,
          },
        ]),
    {
      kind: "total",
      label: "Operating profit",
      current: c.pnl.operatingProfitCents,
      previous: p.pnl.operatingProfitCents,
    },
  ];
  return <Statement rows={rows} base={c.pnl.netRevenueCents} />;
}

function CashFlow({
  current: c,
  previous: p,
  report,
}: {
  current: PeriodTotals;
  previous: PeriodTotals;
  report: FinanceReport;
}) {
  const rows: StatementRow[] = [
    { kind: "line", label: "Card top-ups", current: c.cash.topUpsCents, previous: p.cash.topUpsCents },
    { kind: "total", label: "Cash in", current: c.cash.cashInCents, previous: p.cash.cashInCents },
    { kind: "line", label: "Card processing fees (est.)", current: c.cash.cardFeesCents, previous: p.cash.cardFeesCents, indent: true, negate: true },
    { kind: "line", label: "AI provider", current: c.cash.aiSpendCents, previous: p.cash.aiSpendCents, indent: true, negate: true },
    { kind: "line", label: "Lulu (printing & shipping)", current: c.cash.printSpendCents, previous: p.cash.printSpendCents, indent: true, negate: true },
    { kind: "line", label: "Fixed & operating costs", current: c.cash.operatingCents, previous: p.cash.operatingCents, indent: true, negate: true },
    { kind: "total", label: "Cash out", current: -c.cash.cashOutCents, previous: -p.cash.cashOutCents },
    { kind: "total", label: "Net cash flow", current: c.cash.netCashFlowCents, previous: p.cash.netCashFlowCents },
  ];
  const gap = c.cash.cashInCents - c.pnl.netRevenueCents;
  return (
    <div>
      <Statement rows={rows} />
      <p className="mt-2 text-xs leading-relaxed text-v2-muted">
        Cash in {gap >= 0 ? "exceeded" : "trailed"} net revenue by {money(Math.abs(gap))}:{" "}
        {gap >= 0
          ? "customers topped up more than they spent, which grows what you owe them in product."
          : "customers spent balance they topped up earlier."}{" "}
        Prepaid balance owed at {report.range.to}: {money(report.balances.paidWalletCents)}.
      </p>
    </div>
  );
}

// --- Products -----------------------------------------------------------------------------------

function ProductTable({ products }: { products: ProductLine[] }) {
  if (products.length === 0) {
    return <p className="v2-panel p-4 text-sm text-v2-muted">No sales or product costs in this period.</p>;
  }
  const totals = products.reduce(
    (t, p) => ({
      units: t.units + p.units,
      gross: t.gross + p.grossSalesCents,
      promo: t.promo + p.promoCents,
      net: t.net + p.netRevenueCents,
      cost: t.cost + p.variableCostCents,
      contribution: t.contribution + p.contributionCents,
    }),
    { units: 0, gross: 0, promo: 0, net: 0, cost: 0, contribution: 0 },
  );
  return (
    <div className="v2-panel overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-v2-muted">
            <th className="px-4 py-2.5 text-left font-semibold">Product</th>
            <th className="px-2 py-2.5 text-right font-semibold">Sold</th>
            <th className="px-2 py-2.5 text-right font-semibold">AI calls</th>
            <th className="px-2 py-2.5 text-right font-semibold">Gross sales</th>
            <th className="px-2 py-2.5 text-right font-semibold">Promo</th>
            <th className="px-2 py-2.5 text-right font-semibold">Net revenue</th>
            <th className="px-2 py-2.5 text-right font-semibold">Variable cost</th>
            <th className="px-2 py-2.5 text-right font-semibold">Contribution</th>
            <th className="px-2 py-2.5 text-right font-semibold">CM %</th>
            <th className="px-4 py-2.5 text-right font-semibold">List margin</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.key} className="border-b border-gray-100 text-v2-navy">
              <td className="px-4 py-2 text-left">
                <span className="font-semibold text-v2-ink">{p.name}</span>
                {p.units > 0 && p.variableCostCents > 0 ? (
                  <span className="block text-xs text-v2-muted">
                    {money(p.grossSalesCents / p.units)} price · {money(p.variableCostCents / p.units)} cost per sale
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-2 text-right">{p.units}</td>
              <td className="px-2 py-2 text-right">{p.aiCalls || "—"}</td>
              <td className="px-2 py-2 text-right">{money(p.grossSalesCents)}</td>
              <td className="px-2 py-2 text-right text-v2-muted">{money(-p.promoCents)}</td>
              <td className="px-2 py-2 text-right">{money(p.netRevenueCents)}</td>
              <td className="px-2 py-2 text-right text-v2-muted">{money(-p.variableCostCents)}</td>
              <td className={cn("px-2 py-2 text-right font-semibold", p.contributionCents < 0 ? "text-red-700" : "text-v2-ink")}>
                {money(p.contributionCents)}
              </td>
              <td className="px-2 py-2 text-right">{pct(p.contributionPct)}</td>
              <td className={cn("px-4 py-2 text-right", p.listMarginPct != null && p.listMarginPct < 0 && "text-red-700")}>
                {pct(p.listMarginPct)}
              </td>
            </tr>
          ))}
          <tr className="font-semibold text-v2-ink">
            <td className="px-4 py-2.5 text-left">Total</td>
            <td className="px-2 py-2.5 text-right">{totals.units}</td>
            <td className="px-2 py-2.5 text-right" />
            <td className="px-2 py-2.5 text-right">{money(totals.gross)}</td>
            <td className="px-2 py-2.5 text-right">{money(-totals.promo)}</td>
            <td className="px-2 py-2.5 text-right">{money(totals.net)}</td>
            <td className="px-2 py-2.5 text-right">{money(-totals.cost)}</td>
            <td className={cn("px-2 py-2.5 text-right", totals.contribution < 0 && "text-red-700")}>{money(totals.contribution)}</td>
            <td className="px-2 py-2.5 text-right">{totals.net > 0 ? pct((totals.contribution / totals.net) * 100) : "—"}</td>
            <td className="px-4 py-2.5 text-right">
              {totals.gross > 0 ? pct(((totals.gross - totals.cost) / totals.gross) * 100) : "—"}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="px-4 pb-3 text-xs text-v2-muted">
        Card processing fees aren&apos;t assigned to products; they appear in the P&amp;L.
      </p>
    </div>
  );
}

// --- Balances & unit economics ------------------------------------------------------------------

function Facts({ items }: { items: Array<{ label: string; value: string; note?: string; negative?: boolean }> }) {
  return (
    <dl className="v2-panel divide-y divide-gray-100">
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-4 px-4 py-2.5">
          <dt className="text-sm text-v2-navy">
            {item.label}
            {item.note ? <span className="block text-xs text-v2-muted">{item.note}</span> : null}
          </dt>
          <dd className={cn("shrink-0 text-sm font-semibold tabular-nums", item.negative ? "text-red-700" : "text-v2-ink")}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Balances({ report }: { report: FinanceReport }) {
  const b = report.balances;
  return (
    <Facts
      items={[
        {
          label: "Cash on hand",
          value: b.cashOnHandCents == null ? "Not tracked" : money(b.cashOnHandCents),
          note: b.cashOnHandCents == null ? "Enter a bank balance under Assumptions" : `As of ${report.range.to}`,
          negative: (b.cashOnHandCents ?? 0) < 0,
        },
        {
          label: "Prepaid customer balance",
          value: money(b.paidWalletCents),
          note: "Deferred revenue: collected, not yet earned. A liability.",
        },
        {
          label: "Promo credit outstanding",
          value: money(b.promoWalletCents),
          note: "Given away, unspent. Brings in no cash.",
        },
        {
          label: "Est. cost to honor promo credit",
          value: money(b.promoCostExposureCents),
          note: "Outstanding promo × all-time variable cost ratio",
        },
      ]}
    />
  );
}

function UnitEconomics({ report }: { report: FinanceReport }) {
  const c = report.current.customers;
  const ue = report.unitEconomics;
  const conversion = ue.totalUsers > 0 ? (ue.everPaidUsers / ue.totalUsers) * 100 : null;
  return (
    <Facts
      items={[
        { label: "New sign-ups", value: String(c.signups) },
        {
          label: "Paying customers",
          value: String(c.payingCustomers),
          note: `${c.firstTimePayers} paying for the first time`,
        },
        {
          label: "Paid conversion (all time)",
          value: pct(conversion, 1),
          note: `${ue.everPaidUsers} of ${ue.totalUsers} accounts have ever topped up`,
        },
        {
          label: "Average top-up",
          value: c.avgTopUpCents == null ? "—" : money(c.avgTopUpCents),
          note: c.arppuCents == null ? undefined : `${money(c.arppuCents)} per paying customer`,
        },
        { label: "Promo credit granted", value: money(c.promoGrantedCents), note: "Welcome credit and admin grants" },
        {
          label: "Fixed & operating costs",
          value: `${money(ue.monthlyOperatingCents)} / mo`,
          note: `Net revenue run rate ${money(ue.monthlyNetRevenueCents)} / mo`,
        },
        {
          label: "Break-even net revenue",
          value: ue.breakEvenMonthlyRevenueCents == null ? "—" : `${money(ue.breakEvenMonthlyRevenueCents)} / mo`,
          note:
            ue.breakEvenMonthlyRevenueCents == null
              ? "Needs a positive contribution margin"
              : "Fixed costs ÷ contribution margin %",
        },
        {
          label: "Burn (last 90 days)",
          value: ue.monthlyBurnCents == null ? "Cash-positive" : `${money(ue.monthlyBurnCents)} / mo`,
          note: ue.runwayMonths == null ? undefined : `${ue.runwayMonths.toFixed(1)} months of runway`,
          negative: ue.monthlyBurnCents != null,
        },
      ]}
    />
  );
}

function Methodology() {
  return (
    <details className="v2-panel p-4 text-sm text-v2-navy">
      <summary className="cursor-pointer font-semibold text-v2-ink">How these numbers are worked out</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-v2-muted">
        <li>
          <strong className="text-v2-navy">Cash vs. profit.</strong> Top-ups are cash when the card is charged, but
          revenue only when the wallet is spent. Unspent paid balance is a liability (deferred revenue).
        </li>
        <li>
          <strong className="text-v2-navy">Promo credit.</strong> Each account&apos;s wallet history is replayed with
          two buckets, and purchases spend promo credit first. The promo-funded part of a sale is a discount, not
          revenue, but its AI and printing costs are still real.
        </li>
        <li>
          <strong className="text-v2-navy">Variable costs.</strong> AI is the measured cost of every model call,
          assigned to products by operation (calls no product charges for appear as &ldquo;not sold&rdquo;). Printing is
          Lulu&apos;s quoted total for orders that were paid and not canceled. Card fees are estimated per top-up from the
          rate under Assumptions.
        </li>
        <li>
          <strong className="text-v2-navy">Fixed costs.</strong> Monthly and yearly costs accrue evenly per day;
          one-time costs land on their date. Cash out assumes they are paid as they accrue.
        </li>
        <li>
          <strong className="text-v2-navy">Comparisons.</strong> &ldquo;Previous&rdquo; is the same number of days
          immediately before the selected range ({"UTC"} dates).
        </li>
        <li>
          <strong className="text-v2-navy">Not included.</strong> Stripe refunds or disputes, sales tax remitted
          separately, income tax, and anything paid outside the app that isn&apos;t entered as a cost.
        </li>
      </ul>
    </details>
  );
}
