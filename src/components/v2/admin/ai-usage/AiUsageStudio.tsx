"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import {
  aiActionLabel,
  count,
  fullDateTime,
  percent,
  relativeTime,
  shortDate,
  usd4,
  type Tone,
} from "@/components/v2/admin/format";
import { CHART_COLORS, TrendChart } from "@/components/v2/admin/TrendChart";
import { aiHealth, isServiceProblem, resolvedAt } from "@/components/v2/admin/aiHealth";
import {
  Callout,
  EmptyState,
  ErrorPanel,
  KpiGrid,
  KpiTile,
  PageHeader,
  PageLoading,
  RefreshButton,
  Section,
  SegmentedControl,
  StatusPill,
  TabPanel,
  Tabs,
} from "@/components/v2/admin/ui";
import { useAdminAlerts } from "@/components/v2/admin/AdminShell";
import { authedFetch } from "@/lib/api/client";
import type { VisionCostSessionSnapshot, VisionErrorEvent, VisionErrorKind, VisionUsageEvent } from "@/lib/visionCost/types";
import type { VisionPersistedSummary, VisionPeriodTotals } from "@/lib/visionCost/store";

type Payload = VisionCostSessionSnapshot & { logTail: string; persisted?: VisionPersistedSummary };
type PeriodKey = keyof VisionPersistedSummary["periods"];
type CallRow = VisionUsageEvent & { userId?: string | null; userEmail?: string | null };
type ErrorRow = VisionErrorEvent & { userId?: string | null; userEmail?: string | null };

const PERIODS: Array<{ id: PeriodKey; label: string }> = [
  { id: "today", label: "Today" },
  { id: "last7d", label: "7 days" },
  { id: "last30d", label: "30 days" },
  { id: "allTime", label: "All time" },
];

const PROBLEM: Record<VisionErrorKind, { label: string; tone: Tone }> = {
  billing: { label: "Billing", tone: "bad" },
  auth: { label: "Sign-in", tone: "bad" },
  quota: { label: "Quota", tone: "warn" },
  safety: { label: "Safety", tone: "warn" },
  other: { label: "Other", tone: "neutral" },
};

const RESOLVED_COPY: Record<"billing" | "auth" | "quota", string> = {
  billing: "The billing problem was",
  auth: "The key problem was",
  quota: "The usage-limit problem was",
};

function customer(row: { userId?: string | null; userEmail?: string | null }): string {
  if (row.userEmail) return row.userEmail;
  if (row.userId) return row.userId.slice(0, 8);
  return "Guest";
}

function When({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={fullDateTime(iso)} className="whitespace-nowrap">
      {relativeTime(iso)}
    </time>
  );
}

/** Totals from this server instance's memory, shaped like a persisted period. */
function sessionTotals(data: Payload): VisionPeriodTotals {
  return { ...data.totals };
}

export function AiUsageStudio() {
  const { refreshAlerts } = useAdminAlerts();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("last30d");
  const [tab, setTab] = useState<"failures" | "calls">("failures");
  /** When the data was fetched: "the last 24 hours" counts back from here. */
  const [loadedAt, setLoadedAt] = useState(0);

  const fetchData = useCallback(async (): Promise<{ data: Payload | null; error: string | null }> => {
    try {
      const res = await authedFetch("/api/vision-costs", { cache: "no-store" });
      if (!res.ok) return { data: null, error: `Couldn't load AI usage (${res.status}).` };
      return { data: (await res.json()) as Payload, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : "Couldn't load AI usage." };
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void fetchData().then((r) => {
      if (!alive) return;
      setLoading(false);
      if (r.data) {
        setData(r.data);
        setLoadedAt(Date.now());
      }
      setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [fetchData]);

  async function refresh() {
    setLoading(true);
    const r = await fetchData();
    setLoading(false);
    if (r.data) {
      setData(r.data);
      setLoadedAt(Date.now());
    }
    setError(r.error);
    refreshAlerts();
  }

  const persisted = data?.persisted?.available ? data.persisted : null;
  const errors: ErrorRow[] = useMemo(
    () => (persisted ? persisted.recentErrors : [...(data?.errors ?? [])].reverse()),
    [persisted, data],
  );
  const calls: CallRow[] = useMemo(
    () => (persisted ? persisted.recentEvents : [...(data?.events ?? [])].reverse()),
    [persisted, data],
  );

  const health = useMemo(() => aiHealth(errors, calls, loadedAt), [errors, calls, loadedAt]);

  /** When each service problem was cleared: the first successful call after it. */
  const resolution = useMemo(() => {
    const oldestCall = calls.reduce((min, c) => Math.min(min, new Date(c.at).getTime()), Infinity);
    const map = new Map<string, { at: string | null; exact: boolean } | null>();
    for (const e of errors) {
      if (!isServiceProblem(e.kind)) continue;
      const at = resolvedAt(e.at, calls);
      // Older than every call we loaded: a later call cleared it, but we can't see which one.
      map.set(e.id, at ? { at, exact: new Date(e.at).getTime() >= oldestCall } : null);
    }
    return map;
  }, [errors, calls]);

  const header = (
    <PageHeader
      title="AI usage"
      description="What making and editing pages costs, and whether it's working."
      actions={
        <>
          {persisted ? <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} ariaLabel="Period" /> : null}
          <RefreshButton onClick={() => void refresh()} loading={loading} />
        </>
      }
    />
  );

  if (!data) {
    return (
      <>
        {header}
        {error ? <ErrorPanel>{error}</ErrorPanel> : <PageLoading label="Loading AI usage" />}
      </>
    );
  }

  const totals = persisted ? persisted.periods[period] : sessionTotals(data);
  const failRate = totals.callCount + totals.errorCount > 0 ? (totals.errorCount / (totals.callCount + totals.errorCount)) * 100 : null;
  const avgPerCall = totals.callCount > 0 ? totals.totalCostUsd / totals.callCount : null;
  const daily = persisted?.daily ?? [];
  const byOperation = persisted?.byOperation ?? [];
  const opTotal = byOperation.reduce((sum, op) => sum + op.totalCostUsd, 0);

  const opColumns: Column<(typeof byOperation)[number]>[] = [
    { key: "action", header: "Action", cell: (r) => <span className="font-semibold text-v2-ink">{aiActionLabel(r.operation)}</span>, sortValue: (r) => aiActionLabel(r.operation) },
    { key: "calls", header: "Calls", align: "right", cell: (r) => count(r.callCount), sortValue: (r) => r.callCount, footer: count(byOperation.reduce((s, r) => s + r.callCount, 0)) },
    { key: "spend", header: "Spend", align: "right", cell: (r) => usd4(r.totalCostUsd), sortValue: (r) => r.totalCostUsd, footer: usd4(opTotal) },
    {
      key: "avg",
      header: "Avg per call",
      align: "right",
      cell: (r) => (r.callCount ? usd4(r.totalCostUsd / r.callCount) : "—"),
      sortValue: (r) => (r.callCount ? r.totalCostUsd / r.callCount : null),
    },
    {
      key: "share",
      header: "Share of spend",
      width: "w-56",
      hideBelow: "md",
      cell: (r) => {
        const share = opTotal > 0 ? (r.totalCostUsd / opTotal) * 100 : 0;
        return (
          <span className="flex items-center gap-2">
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-v2-bg-subtle" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${share}%`, background: CHART_COLORS.primary }} />
            </span>
            <span className="w-12 text-right text-xs tabular-nums text-v2-muted">{percent(share, 0)}</span>
          </span>
        );
      },
      sortValue: (r) => r.totalCostUsd,
    },
  ];

  const errorColumns: Column<ErrorRow>[] = [
    { key: "when", header: "When", cell: (r) => <When iso={r.at} />, sortValue: (r) => r.at },
    { key: "customer", header: "Customer", cell: (r) => <span className="block max-w-56 truncate">{customer(r)}</span> },
    { key: "action", header: "Action", cell: (r) => aiActionLabel(r.operation), hideBelow: "md" },
    {
      key: "problem",
      header: "Problem",
      cell: (r) => <StatusPill tone={PROBLEM[r.kind].tone}>{PROBLEM[r.kind].label}</StatusPill>,
      sortValue: (r) => r.kind,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => {
        // One-off failures (safety, other) don't block the service, so there's nothing to resolve.
        if (!resolution.has(r.id)) return <span className="text-v2-muted">One-off</span>;
        const res = resolution.get(r.id);
        if (!res) return <StatusPill tone="bad">Still failing</StatusPill>;
        return (
          <span title={res.exact && res.at ? `First successful call after it: ${fullDateTime(res.at)}` : undefined}>
            <StatusPill tone="good">{res.exact && res.at ? `Resolved ${relativeTime(res.at)}` : "Resolved"}</StatusPill>
          </span>
        );
      },
      sortValue: (r) => (!resolution.has(r.id) ? 2 : resolution.get(r.id) ? 1 : 0),
    },
    {
      key: "message",
      header: "Message",
      hideBelow: "lg",
      cell: (r) => (
        <span className="block max-w-md truncate text-v2-muted" title={r.message}>
          {r.httpStatus ? `${r.httpStatus} · ` : ""}
          {r.message}
        </span>
      ),
    },
  ];

  const callColumns: Column<CallRow>[] = [
    { key: "when", header: "When", cell: (r) => <When iso={r.at} />, sortValue: (r) => r.at },
    { key: "customer", header: "Customer", cell: (r) => <span className="block max-w-56 truncate">{customer(r)}</span> },
    { key: "action", header: "Action", cell: (r) => aiActionLabel(r.operation), sortValue: (r) => aiActionLabel(r.operation) },
    { key: "model", header: "Model", hideBelow: "lg", cell: (r) => <span className="font-mono text-xs">{r.modelId}</span> },
    { key: "cost", header: "Cost", align: "right", cell: (r) => usd4(r.totalCostUsd), sortValue: (r) => r.totalCostUsd },
  ];

  return (
    <div className="space-y-8">
      {header}

      {error ? <ErrorPanel>Couldn&apos;t refresh: {error}</ErrorPanel> : null}

      {!persisted ? (
        <Callout tone="warning" title="Saved history isn't available">
          The database isn&apos;t reachable, so these numbers come from this server only and reset when it restarts.
        </Callout>
      ) : null}

      {/* An open billing, sign-in or quota problem is an alert in the Alerts column, not a banner here. */}
      {health.blocking || health.quota ? null : health.resolved.length > 0 ? (
        <Callout tone="good" title="Working again">
          {RESOLVED_COPY[health.resolved[0].error.kind as "billing" | "auth" | "quota"]} resolved{" "}
          {relativeTime(health.resolved[0].resolvedAt)} ({fullDateTime(health.resolved[0].resolvedAt)}), when the next call succeeded.
          The last failure was {fullDateTime(health.resolved[0].error.at)}. It stays in the failure history below.
        </Callout>
      ) : health.recentCount > 0 ? (
        <Callout tone="info" title="Working, with a few failed calls">
          {health.recentCount} call{health.recentCount === 1 ? "" : "s"} failed in the last 24 hours. See the failure history below.
        </Callout>
      ) : (
        <Callout tone="good" title="Working normally">
          No failed calls in the last 24 hours.
        </Callout>
      )}

      <KpiGrid>
        <KpiTile label="Spend" value={usd4(totals.totalCostUsd)} trend={period === "last30d" && daily.length ? daily.map((d) => d.costUsd) : undefined} />
        <KpiTile label="Calls" value={count(totals.callCount)} sub={`${count(totals.inputTokens + totals.outputTokens)} tokens`} />
        <KpiTile
          label="Failed calls"
          value={count(totals.errorCount)}
          tone={totals.errorCount > 0 && (failRate ?? 0) >= 10 ? "bad" : "default"}
          sub={failRate == null ? "No calls yet" : `${percent(failRate)} of attempts`}
        />
        <KpiTile label="Avg per call" value={usd4(avgPerCall)} sub="Spend ÷ successful calls" />
      </KpiGrid>

      {persisted ? (
        <Section title="Daily spend" description="The last 30 days, in UTC days.">
          <div className="v2-panel p-5">
            {daily.length && daily.some((d) => d.calls || d.errors) ? (
              <TrendChart
                ariaLabel="Daily AI spend and failed calls over the last 30 days"
                labels={daily.map((d) => shortDate(`${d.date}T12:00:00Z`))}
                series={[{ label: "Spend", values: daily.map((d) => d.costUsd), color: CHART_COLORS.primary, kind: "bar" }]}
                format={usd4}
                axisFormat={(v) => `$${v.toFixed(v >= 1 || v === 0 ? 0 : 2)}`}
              />
            ) : (
              <EmptyState icon={Sparkles} title="No AI calls in the last 30 days" />
            )}
            {daily.some((d) => d.errors) ? (
              <p className="mt-3 text-xs text-v2-muted">
                Days with failed calls:{" "}
                {daily
                  .filter((d) => d.errors)
                  .map((d) => `${shortDate(`${d.date}T12:00:00Z`)} (${d.errors})`)
                  .join(", ")}
              </p>
            ) : null}
          </div>
        </Section>
      ) : null}

      {persisted ? (
        <Section title="Cost by action" description="Last 30 days, most expensive first.">
          <DataTable
            caption="AI spend by action over the last 30 days"
            columns={opColumns}
            rows={byOperation}
            rowKey={(r) => r.operation}
            defaultSort={{ key: "spend", dir: "desc" }}
            showFooter
            empty={<EmptyState icon={Sparkles} title="No AI calls in the last 30 days" />}
          />
        </Section>
      ) : null}

      <section className="space-y-4">
        <Tabs
          idPrefix="ai-activity"
          ariaLabel="Recent activity"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "failures", label: "Failure history", count: errors.length },
            { id: "calls", label: "Recent calls", count: calls.length },
          ]}
        />
        {tab === "failures" ? (
          <TabPanel idPrefix="ai-activity" id="failures">
            <DataTable
              caption="Recent failed AI calls"
              columns={errorColumns}
              rows={errors}
              rowKey={(r) => r.id}
              defaultSort={{ key: "when", dir: "desc" }}
              empty={<EmptyState title="No failed calls">Every recent call to the image service worked.</EmptyState>}
            />
          </TabPanel>
        ) : (
          <TabPanel idPrefix="ai-activity" id="calls">
            <DataTable
              caption="Recent AI calls"
              columns={callColumns}
              rows={calls}
              rowKey={(r) => r.id}
              defaultSort={{ key: "when", dir: "desc" }}
              empty={<EmptyState icon={Sparkles} title="No AI calls in this period" />}
            />
          </TabPanel>
        )}
      </section>

      <Diagnostics data={data} />
    </div>
  );
}

function Diagnostics({ data }: { data: Payload }) {
  return (
    <details className="v2-panel p-5 text-sm text-v2-navy">
      <summary className="cursor-pointer font-semibold text-v2-ink">Diagnostics</summary>
      <p className="mt-1 text-xs text-v2-muted">For troubleshooting: model rates and this server&apos;s own counters.</p>

      <h3 className="mt-5 text-sm font-semibold text-v2-ink">Model rates (USD per 1M tokens)</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-v2-muted">
              <th className="py-1.5 pr-4 font-semibold">Model</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Input</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Image input</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Text output</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Image output</th>
              <th className="py-1.5 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.modelRates.map((r) => (
              <tr key={r.modelId} className="border-t border-gray-100">
                <td className="py-1.5 pr-4 font-mono text-xs">{r.modelId}</td>
                <td className="py-1.5 pr-4 text-right">{usd4(r.inputUsdPerMTok)}</td>
                <td className="py-1.5 pr-4 text-right">{usd4(r.inputImageUsdPerMTok ?? null)}</td>
                <td className="py-1.5 pr-4 text-right">{usd4(r.outputTextUsdPerMTok)}</td>
                <td className="py-1.5 pr-4 text-right">{usd4(r.outputImageUsdPerMTok)}</td>
                <td className="py-1.5 text-v2-muted">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-5 text-sm font-semibold text-v2-ink">This server instance</h3>
      <p className="text-xs text-v2-muted">In memory only; resets whenever the server restarts.</p>
      <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Session", <span key="s" className="font-mono text-xs">{data.sessionId}</span>],
          ["Started", fullDateTime(data.startedAt)],
          ["Rates checked", data.ratesFetchedAt ? fullDateTime(data.ratesFetchedAt) : "Pending"],
          ["Rates source", data.ratesSource ?? "—"],
          ["Calls", `${count(data.totals.callCount)} (${count(data.totals.errorCount)} failed)`],
          ["Spend", usd4(data.totals.totalCostUsd)],
          ["Log file", <span key="l" className="break-all font-mono text-xs">{data.logFilePath}</span>],
        ].map(([label, value]) => (
          <div key={label as string}>
            <dt className="text-xs text-v2-muted">{label}</dt>
            <dd className="text-sm text-v2-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-5 text-sm font-semibold text-v2-ink">Log tail</h3>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-v2-bg-subtle p-3 font-mono text-xs leading-relaxed text-v2-navy">
        {data.logTail || "(empty)"}
      </pre>
    </details>
  );
}
