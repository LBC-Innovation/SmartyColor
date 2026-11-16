"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Package } from "lucide-react";
import { useAdminAlerts } from "@/components/v2/admin/AdminShell";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { fullDateTime, money, percent, relativeTime, shortDate, shortId } from "@/components/v2/admin/format";
import { orderAttention, orderMoney } from "@/components/v2/admin/orderAttention";
import { EmptyState, ErrorPanel, PageHeader, RefreshButton, SearchInput, TabPanel, Tabs } from "@/components/v2/admin/ui";
import { useUrlParam } from "@/components/v2/admin/useUrlParam";
import { OrderDrawer } from "@/components/v2/admin/orders/OrderDrawer";
import { bookLabel, customerLabel, inTab, OrderStatusPill, orderTitle, type OrderTab } from "@/components/v2/admin/orders/orderDisplay";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { adminCanCancel } from "@/lib/orders/cancelWindow";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";
import { cn } from "@/lib/cn";

const TAB_LABELS: Array<{ id: OrderTab; label: string }> = [
  { id: "attention", label: "Needs attention" },
  { id: "progress", label: "In progress" },
  { id: "shipped", label: "Shipped" },
  { id: "canceled", label: "Canceled" },
  { id: "all", label: "All" },
];

function matches(order: AdminUserOrderSummary, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [order.id, order.projectTitle, order.userEmail, order.contactEmail, order.productName]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(needle));
}

export function AdminOrdersScreen() {
  const { user } = useAuth();
  const canViewCustomers = user?.permissions.includes("usermanage:listusers") ?? false;
  const { refreshAlerts } = useAdminAlerts();
  const [orders, setOrders] = useState<AdminUserOrderSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** When the list arrived; "how long ago" checks measure from here so render stays pure. */
  const [loadedAt, setLoadedAt] = useState(0);
  const [chosenTab, setChosenTab] = useUrlParam("tab");
  const [openId, setOpenId] = useUrlParam("order");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    void api.adminListAllOrders().then((result) => {
      if (!alive) return;
      setLoading(false);
      if (api.isError(result)) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setLoadedAt(Date.now());
      setOrders(result.data);
    });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const attentionIds = useMemo(
    () => new Set((orders ?? []).filter((o) => orderAttention(o, loadedAt)).map((o) => o.id)),
    [orders, loadedAt],
  );

  const counts = useMemo(() => {
    const c: Record<OrderTab, number> = { attention: 0, progress: 0, shipped: 0, canceled: 0, all: 0 };
    for (const o of orders ?? []) {
      for (const t of TAB_LABELS) if (inTab(o, t.id, attentionIds.has(o.id))) c[t.id] += 1;
    }
    return c;
  }, [orders, attentionIds]);

  const validTab = TAB_LABELS.some((t) => t.id === chosenTab) ? (chosenTab as OrderTab) : null;
  const tab: OrderTab = validTab ?? (counts.attention > 0 ? "attention" : counts.progress > 0 || !orders ? "progress" : "all");

  const rows = useMemo(
    () => (orders ?? []).filter((o) => inTab(o, tab, attentionIds.has(o.id)) && matches(o, query.trim())),
    [orders, tab, attentionIds, query],
  );

  const totals = useMemo(() => {
    let charged = 0;
    let cost = 0;
    let marginBase = 0;
    let margin = 0;
    for (const o of rows) {
      const m = orderMoney(o);
      if (m.marginCents == null) continue;
      charged += m.chargedCents ?? 0;
      cost += m.costCents ?? 0;
      margin += m.marginCents;
      marginBase += (m.chargedCents ?? 0) - (o.fulfillment === "digital" ? 0 : (o.taxCents ?? 0));
    }
    return { charged, cost, margin, pct: marginBase > 0 ? (margin / marginBase) * 100 : null };
  }, [rows]);

  // The drawer finds its order in the full list, so a link from Overview works whatever tab is shown.
  const openOrder = openId ? (orders ?? []).find((o) => o.id === openId) ?? null : null;

  const columns: Column<AdminUserOrderSummary>[] = [
    {
      key: "order",
      header: "Order",
      sortValue: (o) => orderTitle(o).toLowerCase(),
      cell: (o) => (
        <span className="block min-w-0">
          <span className="block max-w-[16rem] truncate font-semibold text-v2-ink">{orderTitle(o)}</span>
          <span className="block font-mono text-xs text-v2-muted">{shortId(o.id)}</span>
        </span>
      ),
      footer: `${rows.length} order${rows.length === 1 ? "" : "s"}`,
    },
    {
      key: "customer",
      header: "Customer",
      sortValue: (o) => customerLabel(o)?.toLowerCase() ?? "",
      cell: (o) => {
        const c = customerLabel(o);
        return c ? <span className="block max-w-[14rem] truncate">{c}</span> : <span className="text-v2-muted">Deleted account</span>;
      },
    },
    { key: "book", header: "Book", hideBelow: "xl", cell: (o) => <span className="block max-w-56 text-v2-muted">{bookLabel(o)}</span> },
    {
      key: "status",
      header: "Status",
      sortValue: (o) => o.status,
      cell: (o) => (
        <span className="flex flex-col items-start gap-0.5">
          <OrderStatusPill order={o} />
          {adminCanCancel(o) && o.luluProductionDueAt ? (
            <span className="whitespace-nowrap text-xs text-v2-muted" title={fullDateTime(o.luluProductionDueAt)}>
              Cancel by {shortDate(o.luluProductionDueAt)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "charged",
      header: "Charged",
      align: "right",
      sortValue: (o) => o.totalCents ?? -1,
      cell: (o) => money(o.totalCents),
      footer: money(totals.charged),
    },
    {
      key: "cost",
      header: "Our cost",
      align: "right",
      hideBelow: "lg",
      sortValue: (o) => orderMoney(o).costCents ?? -1,
      cell: (o) => (o.fulfillment === "digital" ? <span className="text-v2-muted">—</span> : money(o.luluCostCents)),
      footer: money(totals.cost),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      hideBelow: "lg",
      sortValue: (o) => orderMoney(o).marginPct ?? -Infinity,
      cell: (o) => {
        const m = orderMoney(o);
        return <span className={cn(m.marginCents != null && m.marginCents < 0 && "font-semibold text-red-700")}>{percent(m.marginPct, 0)}</span>;
      },
      footer: percent(totals.pct, 0),
    },
    {
      key: "placed",
      header: "Placed",
      align: "right",
      sortValue: (o) => o.createdAt,
      cell: (o) => (
        <time dateTime={o.createdAt} title={fullDateTime(o.createdAt)} className="whitespace-nowrap">
          {relativeTime(o.createdAt)}
        </time>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every book order, newest first. Click one to see the money and take action."
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Order, email or album…" label="Search orders" />
            <RefreshButton onClick={reload} loading={loading} />
          </>
        }
      />

      {error ? <ErrorPanel>Couldn&apos;t load orders: {error}</ErrorPanel> : null}

      <div className="space-y-4">
        <Tabs
          idPrefix="orders"
          ariaLabel="Order status"
          value={tab}
          onChange={(id) => setChosenTab(id)}
          tabs={TAB_LABELS.map((t) => ({
            ...t,
            count: orders ? counts[t.id] : undefined,
            tone: t.id === "attention" ? "bad" : "default",
          }))}
        />
        <TabPanel idPrefix="orders" id={tab}>
          <DataTable
            caption={`Orders: ${TAB_LABELS.find((t) => t.id === tab)?.label}`}
            columns={columns}
            rows={rows}
            rowKey={(o) => o.id}
            rowLabel={(o) => `Open order ${shortId(o.id)}, ${orderTitle(o)}`}
            onRowClick={(o) => setOpenId(o.id)}
            selectedKey={openId}
            loading={loading && !orders}
            defaultSort={{ key: "placed", dir: "desc" }}
            showFooter
            empty={
              query.trim() ? (
                <EmptyState title="No orders match your search." />
              ) : tab === "attention" ? (
                <EmptyState icon={CheckCircle2} title="No orders need you." />
              ) : (
                <EmptyState icon={Package} title="No orders here." />
              )
            }
            mobileCard={(o) => (
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-v2-ink">{orderTitle(o)}</span>
                  <span className="block truncate text-xs text-v2-muted">
                    {customerLabel(o) ?? "Deleted account"} · {relativeTime(o.createdAt)}
                  </span>
                  <span className="mt-1 block">
                    <OrderStatusPill order={o} />
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-v2-ink">{money(o.totalCents)}</span>
              </span>
            )}
          />
        </TabPanel>
      </div>

      {openOrder ? (
        <OrderDrawer
          key={openOrder.id}
          order={openOrder}
          canViewCustomers={canViewCustomers}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            reload();
            refreshAlerts();
          }}
        />
      ) : null}
    </>
  );
}
