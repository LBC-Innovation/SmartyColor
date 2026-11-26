"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Users } from "lucide-react";
import { useAdminAlerts } from "@/components/v2/admin/AdminShell";
import { DataTable } from "@/components/v2/admin/DataTable";
import {
  fullDateTime,
  money,
  percent,
  relativeTime,
  shortId,
  signedCount,
  signedMoney,
} from "@/components/v2/admin/format";
import { customerLabel, OrderStatusPill, orderTitle } from "@/components/v2/admin/orders/orderDisplay";
import { CHART_COLORS, TrendChart } from "@/components/v2/admin/TrendChart";
import {
  EmptyState,
  KpiGrid,
  KpiTile,
  PageHeader,
  RefreshButton,
  Section,
  SectionLink,
} from "@/components/v2/admin/ui";
import { V2UserAvatar } from "@/components/v2/ui/V2UserAvatar";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import type { AdminUser, ApiResult } from "@/lib/api/types";
import type { FinanceReport } from "@/lib/finance/types";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";

const DAY_MS = 86_400_000;

/** The last 30 UTC days, inclusive, as the finance page's "30 days" preset works them out. */
function last30Days(): { from: string; to: string } {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(today - 29 * DAY_MS), to: iso(today) };
}

/** One source of the overview: its data, or an error, while it loads. */
type Source<T> = { data: T | null; error: string | null; loading: boolean };

function useSource<T>(enabled: boolean, load: () => Promise<{ data: T } | { error: string }>, reloadKey: number): Source<T> {
  const [state, setState] = useState<Source<T>>({ data: null, error: null, loading: enabled });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void load().then((r) => {
      if (!alive) return;
      setState("data" in r ? { data: r.data, error: null, loading: false } : { data: null, error: r.error, loading: false });
    });
    return () => {
      alive = false;
    };
    // `load` is a stable module-level loader per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reloadKey]);
  return enabled ? state : { data: null, error: null, loading: false };
}

async function wrap<T>(promise: Promise<ApiResult<T>>): Promise<{ data: T } | { error: string }> {
  const r = await promise;
  return api.isError(r) ? { error: r.error.message } : { data: r.data as T };
}

/** Orders that count as sales: paid in some way and not canceled. */
function counted(o: AdminUserOrderSummary): boolean {
  return !["awaiting_payment", "canceled", "refunded", "failed", "draft", "quoted"].includes(o.status);
}

function SkeletonPanel({ height = "h-28" }: { height?: string }) {
  return <div className={`v2-panel ${height} motion-safe:animate-pulse`} aria-hidden />;
}

export function AdminOverviewScreen() {
  const { user } = useAuth();
  const perms = user?.permissions ?? [];
  const canOrders = perms.includes("usermanage:manageorders");
  const canFinance = perms.includes("finance:view");
  const canUsers = perms.includes("usermanage:listusers");
  const { refreshAlerts } = useAdminAlerts();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  /** "Now" for age checks, set on mount and on Refresh so render stays pure. */
  const [now, setNow] = useState(() => Date.now());

  const orders = useSource<AdminUserOrderSummary[]>(canOrders, () => wrap(api.adminListAllOrders()), reloadKey);
  const finance = useSource<FinanceReport>(canFinance, () => wrap(api.adminGetFinance(last30Days())), reloadKey);
  const users = useSource<AdminUser[]>(canUsers, () => wrap(api.listAdminUsers()), reloadKey);

  const refresh = useCallback(() => {
    setReloadKey((k) => k + 1);
    setNow(Date.now());
    refreshAlerts();
  }, [refreshAlerts]);

  const anyLoading = orders.loading || finance.loading || users.loading;

  // --- KPIs ---
  const orderCounts = useMemo(() => {
    if (!orders.data) return null;
    let current = 0;
    let previous = 0;
    for (const o of orders.data) {
      if (!counted(o)) continue;
      const age = now - new Date(o.createdAt).getTime();
      if (age < 30 * DAY_MS) current += 1;
      else if (age < 60 * DAY_MS) previous += 1;
    }
    return { current, previous };
  }, [orders.data, now]);

  const report = finance.data;
  const series = report?.series ?? [];

  const recentOrders = useMemo(() => (orders.data ?? []).slice(0, 5), [orders.data]);
  const newCustomers = useMemo(
    () => [...(users.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [users.data],
  );

  return (
    <>
      <PageHeader
        title="Overview"
        description="How the last 30 days went. Anything that needs you is in Alerts."
        actions={<RefreshButton onClick={refresh} loading={anyLoading} />}
      />

      <div className="space-y-8">
        {canFinance ? (
          <Section title="Last 30 days" id="kpis" action={<SectionLink href="/admin/finance">View financials</SectionLink>}>
            {finance.error ? (
              <p className="v2-panel p-4 text-sm text-red-700" role="alert">
                Couldn&apos;t load the numbers: {finance.error}
              </p>
            ) : !report ? (
              <KpiGrid>
                {Array.from({ length: 4 }, (_, i) => (
                  <SkeletonPanel key={i} />
                ))}
              </KpiGrid>
            ) : (
              <KpiGrid>
                <KpiTile
                  label="Net revenue"
                  value={money(report.current.pnl.netRevenueCents)}
                  delta={{
                    value: report.current.pnl.netRevenueCents - report.previous.pnl.netRevenueCents,
                    text: signedMoney(report.current.pnl.netRevenueCents - report.previous.pnl.netRevenueCents),
                    goodWhen: "up",
                  }}
                  trend={series.map((p) => p.netRevenueCents)}
                  href="/admin/finance"
                />
                {orderCounts ? (
                  <KpiTile
                    label="Orders"
                    value={String(orderCounts.current)}
                    delta={{
                      value: orderCounts.current - orderCounts.previous,
                      text: signedCount(orderCounts.current - orderCounts.previous),
                      goodWhen: "up",
                    }}
                    href="/admin/orders"
                  />
                ) : null}
                <KpiTile
                  label="Gross profit"
                  value={money(report.current.pnl.contributionCents)}
                  tone={report.current.pnl.contributionCents < 0 ? "bad" : "default"}
                  sub={`${percent(report.current.pnl.contributionPct)} margin`}
                  delta={{
                    value: report.current.pnl.contributionCents - report.previous.pnl.contributionCents,
                    text: signedMoney(report.current.pnl.contributionCents - report.previous.pnl.contributionCents),
                    goodWhen: "up",
                  }}
                  href="/admin/finance"
                />
                <KpiTile
                  label="New customers"
                  value={String(report.current.customers.signups)}
                  delta={{
                    value: report.current.customers.signups - report.previous.customers.signups,
                    text: signedCount(report.current.customers.signups - report.previous.customers.signups),
                    goodWhen: "up",
                  }}
                  href={canUsers ? "/admin/users" : undefined}
                />
              </KpiGrid>
            )}
          </Section>
        ) : null}

        {canFinance && report && series.length ? (
          <Section
            title="Revenue and costs, last 30 days"
            description="Net revenue earned each day, what went out (card fees, AI, printing, your costs), and operating profit."
            id="trend"
          >
            <div className="v2-panel p-5">
              <TrendChart
                ariaLabel="Net revenue, cash out and operating profit by day over the last 30 days"
                labels={series.map((p) => p.label)}
                format={(v) => money(v)}
                axisFormat={(v) => money(v, { compact: true })}
                series={[
                  { label: "Net revenue", values: series.map((p) => p.netRevenueCents), color: CHART_COLORS.primary, kind: "bar" },
                  { label: "Costs paid", values: series.map((p) => p.cashOutCents), color: CHART_COLORS.cost, kind: "barDown" },
                  { label: "Operating profit", values: series.map((p) => p.operatingProfitCents), color: CHART_COLORS.net, kind: "line" },
                ]}
              />
            </div>
          </Section>
        ) : null}

        {canOrders || canUsers ? (
          <div className="grid gap-8 xl:grid-cols-2">
            {canOrders ? (
              <Section title="Recent orders" id="recent-orders" action={<SectionLink href="/admin/orders?tab=all">View all</SectionLink>}>
                <DataTable
                  caption="Five most recent orders"
                  rows={recentOrders}
                  rowKey={(o) => o.id}
                  loading={orders.loading}
                  rowLabel={(o) => `Open order ${shortId(o.id)}, ${orderTitle(o)}`}
                  onRowClick={(o) => router.push(`/admin/orders?order=${o.id}`)}
                  empty={
                    <EmptyState icon={Package} title="No orders yet.">
                      They&apos;ll show up here as soon as someone buys a book.
                    </EmptyState>
                  }
                  columns={[
                    {
                      key: "album",
                      header: "Album",
                      cell: (o) => (
                        <span className="block min-w-0">
                          <span className="block max-w-[14rem] truncate font-semibold text-v2-ink">{orderTitle(o)}</span>
                          <span className="block max-w-[14rem] truncate text-xs text-v2-muted">{customerLabel(o) ?? "Deleted account"}</span>
                        </span>
                      ),
                    },
                    { key: "status", header: "Status", cell: (o) => <OrderStatusPill order={o} /> },
                    { key: "charged", header: "Charged", align: "right", cell: (o) => money(o.totalCents) },
                    {
                      key: "when",
                      header: "Placed",
                      align: "right",
                      cell: (o) => (
                        <time dateTime={o.createdAt} title={fullDateTime(o.createdAt)} className="whitespace-nowrap">
                          {relativeTime(o.createdAt)}
                        </time>
                      ),
                    },
                  ]}
                />
              </Section>
            ) : null}
            {canUsers ? (
              <Section title="New customers" id="new-customers" action={<SectionLink href="/admin/users">View all</SectionLink>}>
                <DataTable
                  caption="Five newest accounts"
                  rows={newCustomers}
                  rowKey={(u) => u.id}
                  loading={users.loading}
                  rowLabel={(u) => `Open ${u.displayName ?? u.email ?? "customer"}`}
                  onRowClick={(u) => router.push(`/admin/users?user=${u.id}`)}
                  empty={<EmptyState icon={Users} title="No accounts yet." />}
                  columns={[
                    {
                      key: "who",
                      header: "Customer",
                      cell: (u) => (
                        <span className="flex min-w-0 items-center gap-3">
                          <V2UserAvatar name={u.displayName ?? u.email ?? "?"} src={u.avatarUrl} size={28} />
                          <span className="min-w-0">
                            <span className="block max-w-[14rem] truncate font-semibold text-v2-ink">{u.displayName ?? u.email}</span>
                            {u.displayName ? <span className="block max-w-[14rem] truncate text-xs text-v2-muted">{u.email}</span> : null}
                          </span>
                        </span>
                      ),
                    },
                    {
                      key: "joined",
                      header: "Joined",
                      align: "right",
                      cell: (u) => (
                        <time dateTime={u.createdAt} title={fullDateTime(u.createdAt)} className="whitespace-nowrap">
                          {relativeTime(u.createdAt)}
                        </time>
                      ),
                    },
                    {
                      key: "spent",
                      header: "Spent",
                      align: "right",
                      cell: (u) => (u.lifetimeSpendCents ? money(u.lifetimeSpendCents) : <span className="text-v2-muted">—</span>),
                    },
                  ]}
                />
              </Section>
            ) : null}
          </div>
        ) : null}

        {users.error || orders.error ? (
          <p className="text-sm text-red-700" role="alert">
            {[users.error && `Couldn't load customers: ${users.error}`, orders.error && `Couldn't load orders: ${orders.error}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>
    </>
  );
}
