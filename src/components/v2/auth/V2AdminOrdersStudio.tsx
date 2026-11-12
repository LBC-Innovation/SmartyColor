"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, XCircle } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { ADMIN_CONTENT_CLASS, V2AdminToolbar } from "@/components/v2/auth/V2AdminSubNav";
import { CancelOrderModal } from "@/components/v2/orders/CancelOrderModal";
import { V2OrderStatusBadge } from "@/components/v2/orders/V2OrderStatusBadge";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import { adminCanCancel } from "@/lib/orders/cancelWindow";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";
import { cn } from "@/lib/cn";

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "active", label: "In progress" },
  { id: "", label: "All" },
  { id: "shipped", label: "Shipped" },
  { id: "failed", label: "Failed" },
  { id: "canceled", label: "Canceled" },
];

function shortTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Admin: every customer's book orders, with cancel-and-refund while production hasn't started. */
export function V2AdminOrdersStudio() {
  const [filter, setFilter] = useState("active");
  const [orders, setOrders] = useState<AdminUserOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<AdminUserOrderSummary | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    void api.adminListAllOrders(filter || undefined).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (api.isError(result)) {
        setError(result.error.message);
        setOrders([]);
        return;
      }
      setError(null);
      setOrders(result.data);
    });
    return () => {
      alive = false;
    };
  }, [filter, reloadKey]);

  function reload(nextFilter = filter): void {
    setLoading(true);
    setFilter(nextFilter);
    setReloadKey((k) => k + 1);
  }

  return (
    <V2StudioFrame>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <V2AdminToolbar />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <div className={`${ADMIN_CONTENT_CLASS} py-6 sm:py-8`}>
            <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">Orders</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-v2-muted">
                  Every customer&apos;s book orders, newest first. An order can be canceled, with the
                  customer&apos;s wallet refunded, until the printer starts production.
                </p>
              </div>
              <button
                type="button"
                onClick={() => reload()}
                disabled={loading}
                className="v2-hit inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-v2-ink"
              >
                <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden />
                Refresh
              </button>
            </header>

            <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter orders">
              {FILTERS.map((f) => (
                <button
                  key={f.id || "all"}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => reload(f.id)}
                  className={cn(
                    "h-9 rounded-full px-3.5 text-sm font-semibold transition-colors",
                    filter === f.id
                      ? "bg-v2-primary text-white"
                      : "border border-gray-200 bg-white text-v2-navy hover:bg-v2-bg-subtle",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {notice ? (
              <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {notice}
              </p>
            ) : null}
            {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}

            <div className="v2-panel overflow-hidden">
              {loading && orders.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-6 text-sm text-v2-muted">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading orders…
                </p>
              ) : orders.length === 0 ? (
                <p className="px-4 py-6 text-sm text-v2-muted">No orders here.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {orders.map((order) => {
                    const cancelable = adminCanCancel(order);
                    return (
                      <li key={order.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-v2-ink">
                            {order.projectTitle ?? order.productName}
                          </p>
                          <p className="text-xs text-v2-muted">
                            {order.id.slice(0, 8).toUpperCase()} ·{" "}
                            {order.userEmail ?? order.contactEmail ?? order.userId.slice(0, 8)} ·{" "}
                            {order.fulfillment === "digital" ? "Print at home · " : ""}
                            {order.pageCount} pages ·{" "}
                            {order.totalCents != null ? formatCredits(order.totalCents) : "—"} ·{" "}
                            {shortTime(order.createdAt)}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-v2-muted">
                            <V2OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
                            {order.luluPrintJobId ? (
                              <span>
                                Lulu #{order.luluPrintJobId}
                                {order.luluStatusName ? ` · ${order.luluStatusName}` : ""}
                              </span>
                            ) : null}
                            {cancelable && order.luluProductionDueAt ? (
                              <span>Cancelable until {shortTime(order.luluProductionDueAt)}</span>
                            ) : null}
                            {order.refundedCents ? <span>Refunded {formatCredits(order.refundedCents)}</span> : null}
                          </div>
                          {order.cancelReason ? (
                            <p className="mt-1 text-xs text-v2-muted">Cancel reason: “{order.cancelReason}”</p>
                          ) : null}
                          <Link
                            href={`/orders/${order.id}`}
                            className="mt-1 inline-block text-xs text-v2-muted underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View detail
                          </Link>
                        </div>
                        {cancelable ? (
                          <button
                            type="button"
                            className="v2-btn-sm v2-btn-outline inline-flex shrink-0 items-center gap-1"
                            onClick={() => setCancelling(order)}
                          >
                            <XCircle className="h-3.5 w-3.5" aria-hidden />
                            Cancel
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </main>
      </div>
      {cancelling ? (
        <CancelOrderModal
          mode="admin"
          orderId={cancelling.id}
          title={cancelling.projectTitle}
          totalCents={cancelling.status === "draft" || cancelling.status === "quoted" || cancelling.status === "awaiting_payment" ? null : cancelling.totalCents}
          deadline={cancelling.luluProductionDueAt}
          customerLabel={cancelling.userEmail ?? cancelling.contactEmail}
          onClose={() => setCancelling(null)}
          onCanceled={(result) => {
            setCancelling(null);
            setNotice(
              result.refundedCents > 0
                ? `Order ${cancelling.id.slice(0, 8).toUpperCase()} canceled; ${formatCredits(result.refundedCents)} returned to the customer's wallet.`
                : `Order ${cancelling.id.slice(0, 8).toUpperCase()} canceled.`,
            );
            reload();
          }}
        />
      ) : null}
    </V2StudioFrame>
  );
}
