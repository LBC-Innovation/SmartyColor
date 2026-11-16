"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import type { AcquisitionReport, AttributionModel, ChannelRow, HeardFromRow, ReferrerRow, SourceRow, SpendEntry } from "@/lib/marketing/acquisitionTypes";
import { CHANNEL_LABELS, CHANNELS, type Channel } from "@/lib/marketing/channel";
import { HEARD_FROM_LABELS } from "@/lib/marketing/heardFrom";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { CHART_COLORS, TrendChart } from "@/components/v2/admin/TrendChart";
import { count, money, percent, shortDate, usdCost } from "@/components/v2/admin/format";
import {
  Callout,
  EmptyState,
  ErrorPanel,
  KpiGrid,
  KpiTile,
  MoneyInput,
  PageHeader,
  PageLoading,
  RefreshButton,
  Section,
  SegmentedControl,
} from "@/components/v2/admin/ui";
import { useUrlParam } from "@/components/v2/admin/useUrlParam";

type Period = "7" | "30" | "90" | "365" | "all";
const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
  { id: "365", label: "12 months" },
  { id: "all", label: "All time" },
];
const MODELS: Array<{ id: AttributionModel; label: string }> = [
  { id: "first", label: "First visit" },
  { id: "last", label: "Last visit" },
];

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/** Cost per customer, or "—" without spend or customers. */
function cac(spendCents: number, customers: number): string {
  return spendCents > 0 && customers > 0 ? money(Math.round(spendCents / customers)) : "—";
}

function roas(revenueCents: number, spendCents: number): string {
  return spendCents > 0 ? `${(revenueCents / spendCents).toFixed(2)}×` : "—";
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dollarsToCents(text: string): number | null {
  const n = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

// --- Spend editor --------------------------------------------------------------------------------

function SpendEditor({ canEdit, onChanged }: { canEdit: boolean; onChanged: () => void }) {
  const [entries, setEntries] = useState<SpendEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(thisMonth);
  const [channel, setChannel] = useState<Channel>("paid_social");
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await api.adminListSpend();
    if (api.isError(r)) setError(r.error.message);
    else {
      setError(null);
      setEntries(r.data);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void api.adminListSpend().then((r) => {
      if (!alive) return;
      if (api.isError(r)) setError(r.error.message);
      else setEntries(r.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cents = dollarsToCents(amount);
    if (cents == null) {
      setError("Enter the amount spent, like 250 or 250.00.");
      return;
    }
    setSaving(true);
    const r = await api.adminSaveSpend({ month, channel, source, campaign, amountCents: cents });
    setSaving(false);
    if (api.isError(r)) {
      setError(r.error.message);
      return;
    }
    setAmount("");
    await load();
    onChanged();
  }

  async function remove(id: string) {
    const r = await api.adminDeleteSpend(id);
    if (api.isError(r)) setError(r.error.message);
    else {
      await load();
      onChanged();
    }
  }

  const columns: Column<SpendEntry>[] = [
    { key: "month", header: "Month", cell: (r) => r.month.slice(0, 7), sortValue: (r) => r.month },
    { key: "channel", header: "Channel", cell: (r) => CHANNEL_LABELS[r.channel] ?? r.channel, sortValue: (r) => r.channel },
    {
      key: "detail",
      header: "Source / campaign",
      hideBelow: "md",
      cell: (r) => [r.source, r.campaign].filter(Boolean).join(" · ") || <span className="text-v2-muted">All</span>,
    },
    { key: "amount", header: "Spend", align: "right", cell: (r) => money(r.amountCents), sortValue: (r) => r.amountCents },
    ...(canEdit
      ? [
          {
            key: "remove",
            header: <span className="sr-only">Remove</span>,
            align: "right" as const,
            cell: (r: SpendEntry) => (
              <button
                type="button"
                onClick={() => void remove(r.id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-v2-muted hover:bg-red-50 hover:text-red-700"
                aria-label={`Remove ${r.month.slice(0, 7)} ${CHANNEL_LABELS[r.channel]} spend`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {error ? <ErrorPanel>{error}</ErrorPanel> : null}
      {canEdit ? (
        <form onSubmit={save} className="v2-panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <label className="text-sm font-medium text-v2-ink">
            Month
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="v2-input mt-1 w-full" required />
          </label>
          <label className="text-sm font-medium text-v2-ink">
            Channel
            <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="v2-input mt-1 w-full">
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-v2-ink">
            Source <span className="font-normal text-v2-muted">(optional)</span>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="meta, google, tiktok" className="v2-input mt-1 w-full" />
          </label>
          <label className="text-sm font-medium text-v2-ink">
            Campaign <span className="font-normal text-v2-muted">(optional)</span>
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="utm_campaign" className="v2-input mt-1 w-full" />
          </label>
          <label className="text-sm font-medium text-v2-ink">
            Spent
            <MoneyInput value={amount} onChange={setAmount} className="mt-1" ariaLabel="Amount spent" />
          </label>
          <button type="submit" disabled={saving} className="v2-btn-primary min-h-11">
            {saving ? "Saving…" : "Save spend"}
          </button>
        </form>
      ) : null}
      <DataTable
        caption="Ad spend by month"
        columns={columns}
        rows={entries ?? []}
        rowKey={(r) => r.id}
        loading={!entries && !error}
        defaultSort={{ key: "month", dir: "desc" }}
        empty={<EmptyState icon={Megaphone} title="No spend recorded yet">Add each month&apos;s ad spend to see cost per customer.</EmptyState>}
      />
    </div>
  );
}

// --- Page ----------------------------------------------------------------------------------------

export function AcquisitionStudio() {
  const { user } = useAuth();
  const canEdit = Boolean(user?.permissions?.includes("finance:manage"));
  const [periodParam, setPeriodParam] = useUrlParam("period");
  const [modelParam, setModelParam] = useUrlParam("model");
  const period: Period = PERIODS.some((p) => p.id === periodParam) ? (periodParam as Period) : "30";
  const model: AttributionModel = modelParam === "last" ? "last" : "first";
  const [report, setReport] = useState<AcquisitionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api.adminAcquisition({ days: period, model });
    setLoading(false);
    if (api.isError(r)) setError(r.error.message);
    else {
      setError(null);
      setReport(r.data);
    }
  }, [period, model]);

  useEffect(() => {
    let alive = true;
    void api.adminAcquisition({ days: period, model }).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (api.isError(r)) setError(r.error.message);
      else {
        setError(null);
        setReport(r.data);
      }
    });
    return () => {
      alive = false;
    };
  }, [period, model]);

  const channelRows = useMemo(() => report?.channels ?? [], [report]);

  const header = (
    <PageHeader
      title="Acquisition"
      description="Where sign-ups and customers come from, what each channel earns, and what it costs. Credited to each account's first visit by default."
      actions={
        <>
          <SegmentedControl ariaLabel="Period" options={PERIODS} value={period} onChange={(p) => setPeriodParam(p === "30" ? null : p)} />
          <SegmentedControl ariaLabel="Credit to" options={MODELS} value={model} onChange={(m) => setModelParam(m === "first" ? null : m)} />
          <RefreshButton onClick={() => void load()} loading={loading} />
        </>
      }
    />
  );

  if (!report) {
    return (
      <>
        {header}
        {error ? <ErrorPanel>Couldn&apos;t load acquisition: {error}</ErrorPanel> : <PageLoading label="Loading acquisition" />}
      </>
    );
  }

  const t = report.totals;
  const chartDays = report.daily.slice(-Math.min(report.daily.length, period === "7" ? 7 : period === "30" ? 30 : 90));

  const channelColumns: Column<ChannelRow>[] = [
    { key: "channel", header: "Channel", cell: (r) => <span className="font-medium text-v2-ink">{CHANNEL_LABELS[r.channel]}</span>, sortValue: (r) => CHANNEL_LABELS[r.channel] },
    { key: "signups", header: "Sign-ups", align: "right", cell: (r) => count(r.signups), sortValue: (r) => r.signups, footer: count(t.signups) },
    {
      key: "customers",
      header: "New customers",
      align: "right",
      cell: (r) => count(r.newCustomers),
      sortValue: (r) => r.newCustomers,
      footer: count(t.newCustomers),
    },
    {
      key: "conv",
      header: "Sign-up → buyer",
      align: "right",
      hideBelow: "lg",
      cell: (r) => percent(ratio(r.newCustomers, r.signups) != null ? ratio(r.newCustomers, r.signups)! * 100 : null, 0),
      sortValue: (r) => ratio(r.newCustomers, r.signups),
    },
    { key: "revenue", header: "Revenue", align: "right", cell: (r) => money(r.revenueCents), sortValue: (r) => r.revenueCents, footer: money(t.revenueCents) },
    { key: "spend", header: "Spend", align: "right", hideBelow: "md", cell: (r) => (r.spendCents ? money(r.spendCents) : "—"), sortValue: (r) => r.spendCents, footer: money(t.spendCents) },
    { key: "cac", header: "Cost / customer", align: "right", hideBelow: "md", cell: (r) => cac(r.spendCents, r.newCustomers), sortValue: (r) => ratio(r.spendCents, r.newCustomers) },
    { key: "roas", header: "ROAS", align: "right", hideBelow: "lg", cell: (r) => roas(r.revenueCents, r.spendCents), sortValue: (r) => ratio(r.revenueCents, r.spendCents) },
    {
      key: "guests",
      header: "Guests (AI cost)",
      align: "right",
      hideBelow: "xl",
      cell: (r) => (r.guestAddresses ? `${count(r.guestAddresses)} (${usdCost(r.guestAiCostUsd)})` : "—"),
      sortValue: (r) => r.guestAddresses,
    },
  ];

  const sourceColumns: Column<SourceRow>[] = [
    { key: "source", header: "Source", cell: (r) => <span className="font-medium text-v2-ink">{r.source}</span>, sortValue: (r) => r.source },
    { key: "campaign", header: "Campaign", cell: (r) => r.campaign || <span className="text-v2-muted">—</span>, sortValue: (r) => r.campaign },
    { key: "channel", header: "Channel", hideBelow: "lg", cell: (r) => CHANNEL_LABELS[r.channel], sortValue: (r) => r.channel },
    { key: "signups", header: "Sign-ups", align: "right", cell: (r) => count(r.signups), sortValue: (r) => r.signups },
    { key: "customers", header: "Customers", align: "right", cell: (r) => count(r.newCustomers), sortValue: (r) => r.newCustomers },
    { key: "revenue", header: "Revenue", align: "right", cell: (r) => money(r.revenueCents), sortValue: (r) => r.revenueCents },
    { key: "cac", header: "Cost / customer", align: "right", hideBelow: "md", cell: (r) => cac(r.spendCents, r.newCustomers), sortValue: (r) => ratio(r.spendCents, r.newCustomers) },
  ];

  const heardColumns: Column<HeardFromRow>[] = [
    { key: "answer", header: "Answer", cell: (r) => <span className="font-medium text-v2-ink">{HEARD_FROM_LABELS[r.answer] ?? r.answer}</span>, sortValue: (r) => r.answer },
    { key: "count", header: "People", align: "right", cell: (r) => count(r.count), sortValue: (r) => r.count },
    { key: "customers", header: "Bought", align: "right", cell: (r) => count(r.customers), sortValue: (r) => r.customers },
    {
      key: "details",
      header: "What they wrote",
      hideBelow: "md",
      cell: (r) => (r.details.length ? <span className="line-clamp-2 text-v2-muted">{r.details.join(" · ")}</span> : null),
    },
  ];

  const referrerColumns: Column<ReferrerRow>[] = [
    { key: "label", header: "Referrer", cell: (r) => <span className="font-medium text-v2-ink">{r.label}</span>, sortValue: (r) => r.label },
    { key: "code", header: "Code", hideBelow: "md", cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "signups", header: "Friends joined", align: "right", cell: (r) => count(r.signups), sortValue: (r) => r.signups },
    { key: "customers", header: "Friends bought", align: "right", cell: (r) => count(r.customers), sortValue: (r) => r.customers },
    { key: "credited", header: "Credit earned", align: "right", hideBelow: "md", cell: (r) => money(r.creditedCents), sortValue: (r) => r.creditedCents },
  ];

  const referralSignups = channelRows.filter((c) => c.channel === "friend_referral" || c.channel === "share").reduce((s, c) => s + c.signups, 0);

  return (
    <div className="space-y-8">
      {header}
      {error ? <ErrorPanel>Couldn&apos;t refresh: {error}</ErrorPanel> : null}

      {!report.tracking ? (
        <Callout tone="warning" title="Apply database migration 0036">
          Until it&apos;s applied, the survey answers, ad spend, campaign links and guest channels stay empty. Sign-ups and orders still show.
        </Callout>
      ) : null}

      <KpiGrid>
        <KpiTile label="Sign-ups" value={count(t.signups)} sub={t.unattributedSignups ? `${count(t.unattributedSignups)} with no recorded source` : "All with a source"} trend={chartDays.map((d) => d.signups)} />
        <KpiTile
          label="New customers"
          value={count(t.newCustomers)}
          sub={t.medianDaysToFirstOrder != null ? `Median ${t.medianDaysToFirstOrder.toFixed(1)} days from sign-up to first order` : "First paid orders"}
          trend={chartDays.map((d) => d.newCustomers)}
        />
        <KpiTile label="Revenue" value={money(t.revenueCents)} sub={`${count(t.orders)} paid orders`} trend={chartDays.map((d) => d.revenueCents)} />
        <KpiTile
          label="Cost per new customer"
          value={cac(t.spendCents, t.newCustomers)}
          sub={t.spendCents ? `${money(t.spendCents)} spend · ROAS ${roas(t.revenueCents, t.spendCents)}` : "Add ad spend below"}
        />
      </KpiGrid>

      <Section id="trend" title="Sign-ups and new customers by day">
        <div className="v2-panel p-4">
          {chartDays.some((d) => d.signups || d.newCustomers) ? (
            <TrendChart
              ariaLabel="Daily sign-ups and new customers"
              labels={chartDays.map((d) => shortDate(`${d.day}T12:00:00Z`))}
              series={[
                { label: "Sign-ups", values: chartDays.map((d) => d.signups), color: CHART_COLORS.primary, kind: "bar" },
                { label: "New customers", values: chartDays.map((d) => d.newCustomers), color: CHART_COLORS.cost, kind: "line" },
              ]}
              format={(v) => count(v)}
            />
          ) : (
            <EmptyState icon={UserPlus} title="No sign-ups in this period" />
          )}
        </div>
      </Section>

      <Section
        id="channels"
        title="By channel"
        description="Spend counts every month the period touches. Guests are visitors without an account, by the channel they arrived from, and what their free pages cost in AI."
      >
        <DataTable
          caption="Acquisition by channel"
          columns={channelColumns}
          rows={channelRows}
          rowKey={(r) => r.channel}
          defaultSort={{ key: "signups", dir: "desc" }}
          showFooter
          empty={<EmptyState icon={Megaphone} title="Nothing recorded in this period" />}
        />
      </Section>

      <Section id="sources" title="By source and campaign" description="The utm_source (or ad platform, or referring site) and utm_campaign each account arrived with.">
        <DataTable
          caption="Acquisition by source and campaign"
          columns={sourceColumns}
          rows={report.sources}
          rowKey={(r) => `${r.channel}|${r.source}|${r.campaign}`}
          defaultSort={{ key: "revenue", dir: "desc" }}
          empty={<EmptyState title="No tagged visits yet">Use Campaign links, or add UTM tags to every ad and post.</EmptyState>}
        />
      </Section>

      <div className="grid gap-8 xl:grid-cols-2">
        <Section
          id="heard"
          title="How did you hear about us?"
          description={`${count(t.heardFromAnswered)} of ${count(t.signups)} new accounts answered. Word of mouth and organic posts often show up here and nowhere else.`}
        >
          <DataTable
            caption="Survey answers"
            columns={heardColumns}
            rows={report.heardFrom}
            rowKey={(r) => r.answer}
            defaultSort={{ key: "count", dir: "desc" }}
            empty={<EmptyState title="No answers yet">New accounts see the question on their home page.</EmptyState>}
          />
        </Section>

        <Section
          id="referrers"
          title="Top referrers"
          description={`${count(referralSignups)} sign-ups came from friend links, shared pages and album invites.`}
        >
          <DataTable
            caption="Accounts whose links brought new accounts"
            columns={referrerColumns}
            rows={report.referrers}
            rowKey={(r) => r.userId}
            defaultSort={{ key: "customers", dir: "desc" }}
            empty={<EmptyState title="No referred sign-ups in this period" />}
          />
        </Section>
      </div>

      <Section id="spend" title="Ad spend" description="Enter what each channel cost per month (from the ad platform's billing). Add a source or campaign to compare campaigns.">
        <SpendEditor canEdit={canEdit} onChanged={() => void load()} />
      </Section>
    </div>
  );
}
