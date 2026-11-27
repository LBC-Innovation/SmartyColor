"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { count, money, percent, signedMoney } from "@/components/v2/admin/format";
import {
  AttentionList,
  Callout,
  DefinitionList,
  EmptyState,
  ErrorPanel,
  KpiGrid,
  KpiTile,
  PageHeader,
  PageLoading,
  RefreshButton,
  Section,
  SegmentedControl,
  TabPanel,
  Tabs,
  type AttentionItemData,
} from "@/components/v2/admin/ui";
import { useUrlParam } from "@/components/v2/admin/useUrlParam";
import { V2FinanceCashChart } from "@/components/v2/finance/V2FinanceCashChart";
import { V2FinanceCosts, V2FinanceSettingsForm } from "@/components/v2/finance/V2FinanceCosts";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  FINANCE_MANAGE_PERMISSION,
  type CostLine,
  type FinanceReport,
  type PeriodTotals,
  type ProductLine,
} from "@/lib/finance/types";

const DAY_MS = 86_400_000;

type PresetId = "30d" | "90d" | "mtd" | "last_month" | "ytd" | "12m" | "all";

const PRESETS: Array<{ id: PresetId; label: string }> = [
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
function presetRange(id: PresetId): { from: string; to: string } {
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

type TabId = "products" | "statements" | "balances" | "costs";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "products", label: "Products" },
  { id: "statements", label: "Statements" },
  { id: "balances", label: "Balances" },
  { id: "costs", label: "Costs & assumptions" },
];

const GROSS_PROFIT_TIP = "Gross profit here is the contribution margin: net revenue minus the variable costs each sale causes.";

export function V2FinanceStudio() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes(FINANCE_MANAGE_PERMISSION) ?? false;
  const [preset, setPreset] = useState<PresetId | null>("30d");
  const [range, setRange] = useState(() => presetRange("30d"));
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabParam, setTabParam] = useUrlParam("tab");
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "products";

  const load = useCallback(async (r: { from: string; to: string }) => {
    setLoading(true);
    const result = await api.adminGetFinance(r);
    setLoading(false);
    if (api.isError(result)) setError(result.error.message);
    else {
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

  function choose(id: PresetId) {
    setPreset(id);
    setLoading(true);
    setRange(presetRange(id));
  }

  function setCustom(part: "from" | "to", value: string) {
    if (!value) return;
    setPreset(null);
    setLoading(true);
    setRange((r) => ({ ...r, [part]: value }));
  }

  const reload = () => void load(range);

  return (
    <>
      <PageHeader
        title="Financials"
        description="Profit counts revenue when customers spend their wallet; cash counts money that actually moved."
        actions={
          <>
            <SegmentedControl options={PRESETS} value={preset} onChange={choose} ariaLabel="Period" />
            <div className="flex items-center gap-1.5 text-sm text-v2-muted">
              <input
                type="date"
                aria-label="From"
                className="v2-input h-9 w-[9.5rem] py-0 text-sm"
                value={report && range.from === "all" ? report.range.from : range.from}
                max={range.to}
                onChange={(e) => setCustom("from", e.target.value)}
              />
              <span aria-hidden>–</span>
              <input
                type="date"
                aria-label="To"
                className="v2-input h-9 w-[9.5rem] py-0 text-sm"
                value={range.to}
                onChange={(e) => setCustom("to", e.target.value)}
              />
            </div>
            <RefreshButton onClick={reload} loading={loading} />
          </>
        }
      />

      {error ? <div className="mb-6"><ErrorPanel>{error}</ErrorPanel></div> : null}

      {!report ? (
        loading ? <PageLoading label="Loading financials" /> : null
      ) : (
        <div className={cn("space-y-8 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          {!report.setupComplete ? (
            <Callout tone="info" title="Fixed costs and assumptions aren't set up yet">
              Profit leaves them out until they are. Everything the app records is still shown.
            </Callout>
          ) : null}

          <Kpis report={report} />
          <Insights report={report} />

          <Section
            title="Cash in vs. cash out"
            description={`By ${report.range.granularity}, ${report.range.from} to ${report.range.to} (UTC). Cash in is card top-ups; cash out is card fees, AI, the printer and your entered costs.`}
          >
            <div className="v2-panel p-5">
              <V2FinanceCashChart series={report.series} />
            </div>
          </Section>

          <div>
            <Tabs tabs={TABS} value={tab} onChange={(id) => setTabParam(id === "products" ? null : id)} ariaLabel="Financial detail" idPrefix="finance" />
            <TabPanel idPrefix="finance" id={tab} className="pt-6">
              {tab === "products" ? <ProductTable products={report.products} /> : null}
              {tab === "statements" ? <Statements report={report} /> : null}
              {tab === "balances" ? <Balances report={report} /> : null}
              {tab === "costs" ? (
                report.setupComplete ? (
                  <div className="space-y-8">
                    <V2FinanceCosts costs={report.costs} canManage={canManage} onChanged={reload} />
                    <V2FinanceSettingsForm
                      key={report.settings.updatedAt ?? "defaults"}
                      settings={report.settings}
                      canManage={canManage}
                      onSaved={reload}
                    />
                  </div>
                ) : (
                  <Callout tone="info" title="Costs and assumptions aren't available yet">
                    The tables that hold them haven&apos;t been set up on this database.
                  </Callout>
                )
              ) : null}
            </TabPanel>
          </div>
        </div>
      )}
    </>
  );
}

// --- KPIs and insights --------------------------------------------------------------------------

function Kpis({ report }: { report: FinanceReport }) {
  const c = report.current;
  const p = report.previous;
  const cash = report.balances.cashOnHandCents;
  const s = report.series;
  const delta = (cur: number, prev: number) => ({ value: cur - prev, text: signedMoney(cur - prev), goodWhen: "up" as const });
  return (
    <KpiGrid>
      <KpiTile
        label="Net revenue"
        value={money(c.pnl.netRevenueCents)}
        delta={delta(c.pnl.netRevenueCents, p.pnl.netRevenueCents)}
        sub={
          c.pnl.purchaseCodeCents > 0
            ? `${money(c.pnl.walletSalesCents)} wallet sales, ${money(c.pnl.purchaseCodeCents)} paid by purchase codes, ${money(c.pnl.promoCents)} promo credit`
            : `${money(c.pnl.grossSalesCents)} sales, ${money(c.pnl.promoCents)} paid with promo credit`
        }
        trend={s.map((x) => x.netRevenueCents)}
      />
      <div title={GROSS_PROFIT_TIP}>
        <KpiTile
          label="Gross profit"
          value={money(c.pnl.contributionCents)}
          delta={delta(c.pnl.contributionCents, p.pnl.contributionCents)}
          sub={`${percent(c.pnl.contributionPct)} margin`}
          tone={c.pnl.contributionCents < 0 ? "bad" : "default"}
        />
      </div>
      <KpiTile
        label="Operating profit"
        value={money(c.pnl.operatingProfitCents)}
        delta={delta(c.pnl.operatingProfitCents, p.pnl.operatingProfitCents)}
        sub={`${percent(c.pnl.operatingMarginPct)} margin, after fixed costs`}
        tone={c.pnl.operatingProfitCents < 0 ? "bad" : "default"}
        trend={s.map((x) => x.operatingProfitCents)}
      />
      {cash != null ? (
        <KpiTile
          label="Cash on hand"
          value={money(cash)}
          sub={
            report.unitEconomics.runwayMonths != null
              ? `${report.unitEconomics.runwayMonths.toFixed(1)} months of runway`
              : "Cash-positive over the last 90 days"
          }
          tone={cash < 0 ? "bad" : "default"}
          trend={s.map((x) => x.netCashFlowCents)}
        />
      ) : (
        <KpiTile
          label="Owed to customers"
          value={money(report.balances.paidWalletCents)}
          sub="Prepaid wallet balance not yet spent"
        />
      )}
    </KpiGrid>
  );
}

function Insights({ report }: { report: FinanceReport }) {
  const [showAll, setShowAll] = useState(false);
  // Critical and warning findings are alerts in the Alerts column; this keeps the notes.
  const actionable = report.insights.filter((i) => i.tone === "info");
  const good = report.insights.filter((i) => i.tone === "good");
  if (actionable.length === 0 && good.length === 0) return null;
  const items: AttentionItemData[] = actionable.map((i) => ({
    tone: i.tone === "critical" ? "critical" : i.tone === "warning" ? "warning" : "info",
    title: i.title,
    detail: i.detail,
  }));
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  const sorted = [...items].sort((a, b) => rank[a.tone] - rank[b.tone]);
  const shown = showAll ? sorted : sorted.slice(0, 5);
  return (
    <Section
      title="Notes on this period"
      action={
        sorted.length > 5 ? (
          <button type="button" className="text-sm font-semibold text-v2-link hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show fewer" : `Show all ${sorted.length}`}
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        {shown.length ? <AttentionList items={shown} /> : null}
        {good.length ? (
          <Callout tone="good" title={good[0].title}>
            {good.length > 1 ? good.map((g) => g.title).slice(1).join(" · ") : good[0].detail}
          </Callout>
        ) : null}
      </div>
    </Section>
  );
}

// --- Products -----------------------------------------------------------------------------------

function ProductTable({ products }: { products: ProductLine[] }) {
  const t = products.reduce(
    (a, p) => ({
      units: a.units + p.units,
      gross: a.gross + p.grossSalesCents,
      promo: a.promo + p.promoCents,
      code: a.code + p.purchaseCodeCents,
      net: a.net + p.netRevenueCents,
      cost: a.cost + p.variableCostCents,
      contribution: a.contribution + p.contributionCents,
    }),
    { units: 0, gross: 0, promo: 0, code: 0, net: 0, cost: 0, contribution: 0 },
  );
  const red = (bad: boolean, node: ReactNode) => <span className={cn(bad && "font-semibold text-red-700")}>{node}</span>;
  const columns: Column<ProductLine>[] = [
    {
      key: "name",
      header: "Product",
      sortValue: (p) => p.name,
      cell: (p) => (
        <span className="block">
          <span className="font-semibold text-v2-ink">{p.name}</span>
          {p.purchaseCodeCents > 0 ? (
            <span className="block text-xs text-v2-muted">
              {money(p.purchaseCodeCents)} paid by purchase codes (prepaid offline)
            </span>
          ) : null}
          {p.units > 0 && p.variableCostCents > 0 ? (
            <span className="block text-xs text-v2-muted">
              {money(p.grossSalesCents / p.units)} price · {money(p.variableCostCents / p.units)} cost per sale
            </span>
          ) : null}
        </span>
      ),
      footer: "Total",
    },
    {
      key: "units",
      header: "Sold",
      align: "right",
      sortValue: (p) => p.units,
      cell: (p) => <span title={p.aiCalls ? `${count(p.aiCalls)} AI calls, including free edits, retries and failures` : undefined}>{count(p.units)}</span>,
      footer: count(t.units),
    },
    { key: "gross", header: "Gross sales", align: "right", hideBelow: "lg", sortValue: (p) => p.grossSalesCents, cell: (p) => money(p.grossSalesCents), footer: money(t.gross) },
    ...(t.code
      ? [
          {
            key: "code",
            header: <span title="Book value a purchase code paid for. Codes are prepaid outside the app, so this is revenue but not cash in.">Purchase codes</span>,
            align: "right",
            hideBelow: "lg",
            sortValue: (p) => p.purchaseCodeCents,
            cell: (p) => <span className="text-v2-muted">{p.purchaseCodeCents ? money(p.purchaseCodeCents) : "—"}</span>,
            footer: money(t.code),
          } satisfies Column<ProductLine>,
        ]
      : []),
    {
      key: "promo",
      header: "Promo",
      align: "right",
      hideBelow: "xl",
      sortValue: (p) => p.promoCents,
      cell: (p) => <span className="text-v2-muted">{p.promoCents ? money(-p.promoCents) : "—"}</span>,
      footer: money(-t.promo),
    },
    { key: "net", header: "Net revenue", align: "right", sortValue: (p) => p.netRevenueCents, cell: (p) => money(p.netRevenueCents), footer: money(t.net) },
    {
      key: "cost",
      header: "Variable cost",
      align: "right",
      sortValue: (p) => p.variableCostCents,
      cell: (p) => <span className="text-v2-muted">{money(-p.variableCostCents)}</span>,
      footer: money(-t.cost),
    },
    {
      key: "contribution",
      header: <span title={GROSS_PROFIT_TIP}>Gross profit</span>,
      align: "right",
      sortValue: (p) => p.contributionCents,
      cell: (p) => red(p.contributionCents < 0, <span className="font-semibold text-v2-ink">{money(p.contributionCents)}</span>),
      footer: red(t.contribution < 0, money(t.contribution)),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      sortValue: (p) => p.contributionPct,
      cell: (p) => red((p.contributionPct ?? 0) < 0, percent(p.contributionPct)),
      footer: t.net > 0 ? percent((t.contribution / t.net) * 100) : "—",
    },
    {
      key: "list",
      header: <span title="Margin at full price, before promo credit">List margin</span>,
      align: "right",
      hideBelow: "md",
      sortValue: (p) => p.listMarginPct,
      cell: (p) => red((p.listMarginPct ?? 0) < 0, percent(p.listMarginPct)),
      footer: t.gross > 0 ? percent(((t.gross - t.cost) / t.gross) * 100) : "—",
    },
  ];
  return (
    <Section
      title="What each product earns"
      description="After the costs it causes: every AI call made for it (free edits, retries and failures included) and the printer's full charge for books. Gross sales include what purchase codes paid for books. List margin is the margin at full price, before promo credit."
    >
      <DataTable
        caption="Gross profit by product"
        columns={columns}
        rows={products}
        rowKey={(p) => p.key}
        showFooter
        defaultSort={{ key: "net", dir: "desc" }}
        empty={<EmptyState title="No sales in this period">Pick a longer period to see what each product earns.</EmptyState>}
      />
      <p className="mt-2 text-xs text-v2-muted">Card processing fees aren&apos;t split by product; they appear in the statements.</p>
    </Section>
  );
}

// --- Statements ---------------------------------------------------------------------------------

type StatementRow =
  | { kind: "line"; label: ReactNode; current: number; previous: number; indent?: boolean; negate?: boolean }
  | { kind: "total"; label: ReactNode; current: number; previous: number; title?: string };

function Statement({ caption, rows, base }: { caption: string; rows: StatementRow[]; base?: number }) {
  return (
    <div className="v2-panel overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-v2-bg-subtle">
          <tr className="text-xs text-v2-muted">
            <th scope="col" className="h-10 px-4 text-left font-semibold">
              <span className="sr-only">Line</span>
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">This period</th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">Previous</th>
            {base != null ? <th scope="col" className="h-10 px-4 text-right font-semibold">% of revenue</th> : null}
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
                <th
                  scope="row"
                  title={r.kind === "total" ? r.title : undefined}
                  className={cn("px-4 py-2 text-left", isTotal ? "font-semibold" : "font-normal", r.kind === "line" && r.indent && "pl-8")}
                >
                  {r.label}
                </th>
                <td className={cn("px-3 py-2 text-right", cur < 0 && "text-red-700")}>{money(cur)}</td>
                <td className={cn("px-3 py-2 text-right text-v2-muted", prev < 0 && isTotal && "text-red-700")}>{money(prev)}</td>
                {base != null ? (
                  <td className="px-4 py-2 text-right text-xs text-v2-muted">{base > 0 ? percent((cur / base) * 100, 0) : "—"}</td>
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

function profitAndLossRows(c: PeriodTotals, p: PeriodTotals): StatementRow[] {
  const codes = c.pnl.purchaseCodeCents || p.pnl.purchaseCodeCents;
  return [
    ...(codes
      ? [
          { kind: "line" as const, label: "Wallet sales", current: c.pnl.walletSalesCents, previous: p.pnl.walletSalesCents, indent: true },
          {
            kind: "line" as const,
            label: (
              <span title="Books a purchase code paid for. Codes are prepaid outside the app, so this matches the book's cost but isn't cash in.">
                Paid by purchase codes (prepaid offline)
              </span>
            ),
            current: c.pnl.purchaseCodeCents,
            previous: p.pnl.purchaseCodeCents,
            indent: true,
          },
          { kind: "total" as const, label: "Gross sales", current: c.pnl.grossSalesCents, previous: p.pnl.grossSalesCents },
        ]
      : [{ kind: "line" as const, label: "Gross sales", current: c.pnl.grossSalesCents, previous: p.pnl.grossSalesCents }]),
    { kind: "line", label: "Less promo credit redeemed", current: c.pnl.promoCents, previous: p.pnl.promoCents, negate: true },
    { kind: "total", label: "Net revenue", current: c.pnl.netRevenueCents, previous: p.pnl.netRevenueCents },
    ...costRows(c.pnl.variableCosts, p.pnl.variableCosts),
    { kind: "total", label: "Gross profit", title: "Contribution margin", current: c.pnl.contributionCents, previous: p.pnl.contributionCents },
    ...costRows(c.pnl.operatingCosts, p.pnl.operatingCosts),
    ...(c.pnl.operatingCosts.length || p.pnl.operatingCosts.length
      ? []
      : [{ kind: "line" as const, label: <span className="text-v2-muted">No fixed costs entered</span>, current: 0, previous: 0, indent: true }]),
    { kind: "total", label: "Operating profit", current: c.pnl.operatingProfitCents, previous: p.pnl.operatingProfitCents },
  ];
}

function cashFlowRows(c: PeriodTotals, p: PeriodTotals): StatementRow[] {
  return [
    { kind: "line", label: "Card top-ups", current: c.cash.topUpsCents, previous: p.cash.topUpsCents },
    { kind: "line", label: "Book packages paid by card", current: c.cash.packageCardCents, previous: p.cash.packageCardCents },
    { kind: "total", label: "Cash in", current: c.cash.cashInCents, previous: p.cash.cashInCents },
    { kind: "line", label: "Card processing fees (est.)", current: c.cash.cardFeesCents, previous: p.cash.cardFeesCents, indent: true, negate: true },
    { kind: "line", label: "AI provider", current: c.cash.aiSpendCents, previous: p.cash.aiSpendCents, indent: true, negate: true },
    { kind: "line", label: "Printing & shipping (Lulu)", current: c.cash.printSpendCents, previous: p.cash.printSpendCents, indent: true, negate: true },
    { kind: "line", label: "Fixed & operating costs", current: c.cash.operatingCents, previous: p.cash.operatingCents, indent: true, negate: true },
    { kind: "total", label: "Cash out", current: -c.cash.cashOutCents, previous: -p.cash.cashOutCents },
    { kind: "total", label: "Net cash flow", current: c.cash.netCashFlowCents, previous: p.cash.netCashFlowCents },
  ];
}

function Statements({ report }: { report: FinanceReport }) {
  const c = report.current;
  const p = report.previous;
  // Purchase-code revenue was paid for outside the app, so compare cash in with wallet revenue only.
  const walletRevenue = c.pnl.netRevenueCents - c.pnl.purchaseCodeCents;
  const gap = c.cash.cashInCents - walletRevenue;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Profit & loss" description="Revenue when wallet money is spent.">
          <Statement caption="Profit and loss" rows={profitAndLossRows(c, p)} base={c.pnl.netRevenueCents} />
        </Section>
        <Section title="Cash flow" description="Money that moved through the bank.">
          <Statement caption="Cash flow" rows={cashFlowRows(c, p)} />
          <p className="mt-2 text-sm text-v2-muted">
            Cash in {gap >= 0 ? "exceeded" : "trailed"} {c.pnl.purchaseCodeCents ? "wallet revenue" : "net revenue"} by{" "}
            {money(Math.abs(gap))}:{" "}
            {gap >= 0
              ? "customers topped up more than they spent, which grows what you owe them in product."
              : "customers spent balance they topped up earlier."}{" "}
            Prepaid balance owed at {report.range.to}: {money(report.balances.paidWalletCents)}.
            {c.pnl.purchaseCodeCents ? (
              <>
                {" "}
                The {money(c.pnl.purchaseCodeCents)} purchase codes paid for books was prepaid outside the app and isn&apos;t
                counted as cash in.
              </>
            ) : null}
          </p>
        </Section>
      </div>
      <Methodology />
    </div>
  );
}

function Methodology() {
  return (
    <details className="v2-panel p-5 text-sm text-v2-navy">
      <summary className="cursor-pointer font-semibold text-v2-ink">How these numbers are worked out</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-v2-muted">
        <li>
          <strong className="text-v2-navy">Cash vs. profit.</strong> Top-ups are cash when the card is charged, but revenue
          only when the wallet is spent. Unspent paid balance is owed to customers (deferred revenue).
        </li>
        <li>
          <strong className="text-v2-navy">Promo credit.</strong> Each account&apos;s wallet history is replayed with two
          buckets, and purchases spend promo credit first. The promo-funded part of a sale is a discount, not revenue,
          but its AI and printing costs are still real.
        </li>
        <li>
          <strong className="text-v2-navy">Purchase codes.</strong> When a purchase code pays for a printed book, its
          share of the order is counted as a sale on the day the order is paid, so the book&apos;s Lulu cost has matching
          revenue. Codes are prepaid outside the app, so that share never appears in cash in; a canceled order gives
          its code back and drops out.
        </li>
        <li>
          <strong className="text-v2-navy">Variable costs.</strong> AI is the measured cost of every model call, assigned
          to products by what it was for (calls no product charges for appear as &ldquo;not sold&rdquo;). Printing is
          Lulu&apos;s quoted total for orders that were paid and not canceled. Card fees are estimated per top-up from the
          rate under Costs &amp; assumptions.
        </li>
        <li>
          <strong className="text-v2-navy">Fixed costs.</strong> Monthly and yearly costs accrue evenly per day; one-time
          costs land on their date. Cash out assumes they are paid as they accrue.
        </li>
        <li>
          <strong className="text-v2-navy">Comparisons.</strong> &ldquo;Previous&rdquo; is the same number of days
          immediately before the selected range (UTC dates).
        </li>
        <li>
          <strong className="text-v2-navy">Not included.</strong> Stripe refunds or disputes, sales tax remitted
          separately, income tax, and anything paid outside the app that isn&apos;t entered as a cost.
        </li>
      </ul>
    </details>
  );
}

// --- Balances -----------------------------------------------------------------------------------

function Balances({ report }: { report: FinanceReport }) {
  const b = report.balances;
  const c = report.current.customers;
  const ue = report.unitEconomics;
  const conversion = ue.totalUsers > 0 ? (ue.everPaidUsers / ue.totalUsers) * 100 : null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="What you hold and owe" description={`At ${report.range.to}.`}>
        <div className="v2-panel px-5 py-1">
          <DefinitionList
            items={[
              {
                label: "Cash on hand",
                value: b.cashOnHandCents == null ? "Not tracked" : money(b.cashOnHandCents),
                note: b.cashOnHandCents == null ? "Enter a bank balance under Costs & assumptions" : undefined,
                tone: (b.cashOnHandCents ?? 0) < 0 ? "bad" : "default",
              },
              { label: "Prepaid customer balance", value: money(b.paidWalletCents), note: "Collected but not yet earned; owed to customers in product" },
              { label: "Promo credit outstanding", value: money(b.promoWalletCents), note: "Given away and unspent; brings in no cash" },
              { label: "Est. cost to honor promo credit", value: money(b.promoCostExposureCents), note: "Outstanding promo × the all-time share of sales spent on variable costs" },
            ]}
          />
        </div>
      </Section>
      <Section title="Customers & break-even" description="For the selected period unless noted.">
        <div className="v2-panel px-5 py-1">
          <DefinitionList
            items={[
              { label: "New sign-ups", value: count(c.signups) },
              { label: "Paying customers", value: count(c.payingCustomers), note: `${count(c.firstTimePayers)} paying for the first time` },
              {
                label: "Paid conversion (all time)",
                value: percent(conversion),
                note: `${count(ue.everPaidUsers)} of ${count(ue.totalUsers)} accounts have ever topped up`,
              },
              {
                label: "Average top-up",
                value: c.avgTopUpCents == null ? "—" : money(c.avgTopUpCents),
                note: c.arppuCents == null ? undefined : `${money(c.arppuCents)} per paying customer`,
              },
              { label: "Promo credit granted", value: money(c.promoGrantedCents), note: "Welcome, referral and manual grants" },
              {
                label: "Fixed & operating costs",
                value: `${money(ue.monthlyOperatingCents)} / mo`,
                note: `Net revenue is running at ${money(ue.monthlyNetRevenueCents)} / mo`,
              },
              {
                label: "Break-even net revenue",
                value: ue.breakEvenMonthlyRevenueCents == null ? "—" : `${money(ue.breakEvenMonthlyRevenueCents)} / mo`,
                note: ue.breakEvenMonthlyRevenueCents == null ? "Needs a positive gross profit margin" : "Fixed costs ÷ gross profit margin",
              },
              {
                label: "Burn (last 90 days)",
                value: ue.monthlyBurnCents == null ? "Cash-positive" : `${money(ue.monthlyBurnCents)} / mo`,
                note: ue.runwayMonths == null ? undefined : `${ue.runwayMonths.toFixed(1)} months of runway`,
                tone: ue.monthlyBurnCents != null ? "bad" : "good",
              },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}
