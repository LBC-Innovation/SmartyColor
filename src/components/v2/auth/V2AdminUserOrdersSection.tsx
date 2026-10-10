"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EyeOff, Loader2, XCircle } from "lucide-react";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import { statusLabel } from "@/lib/orders/fulfillmentTimeline";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";
import { cn } from "@/lib/cn";

export function V2AdminUserOrdersSection({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<AdminUserOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [includeHidden, setIncludeHidden] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await api.adminListUserOrders(userId, includeHidden);
    setLoading(false);
    if (api.isError(result)) {
      setError(result.error.message);
      setOrders([]);
      return;
    }
    setOrders(result.data);
  }, [userId, includeHidden]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelOrder(orderId: string): Promise<void> {
    setBusyId(orderId);
    const result = await api.adminCancelUserOrder(userId, orderId);
    setBusyId(null);
    if (api.isError(result)) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  async function hideOrder(orderId: string): Promise<void> {
    setBusyId(orderId);
    const result = await api.adminHideUserOrder(userId, orderId);
    setBusyId(null);
    if (api.isError(result)) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="v2-section-title mb-0">Book orders</p>
        <label className="flex items-center gap-2 text-xs text-v2-muted">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-v2-primary"
            checked={includeHidden}
            onChange={(e) => setIncludeHidden(e.target.checked)}
          />
          Show hidden
        </label>
      </div>

      {error ? (
        <p className="mb-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="v2-panel overflow-hidden">
        {loading ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-v2-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading orders…
          </p>
        ) : orders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-v2-muted">No orders for this user.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {orders.map((order) => {
              const hidden = Boolean(order.deletedAt);
              const canceled = order.status === "canceled" || Boolean(order.canceledAt);
              const canCancel =
                !hidden && !canceled && !["shipped", "delivered", "refunded"].includes(order.status);
              return (
                <li key={order.id} className={cn("px-4 py-3", hidden && "bg-gray-50/80 opacity-75")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-v2-ink">
                        {order.projectTitle ?? order.productName}
                      </p>
                      <p className="text-xs text-v2-muted">
                        {order.pageCount} pages ·{" "}
                        {order.totalCents != null ? formatCredits(order.totalCents) : "—"} ·{" "}
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                      <p className="mt-1 text-xs font-medium text-v2-link">
                        {statusLabel(order.status)}
                        {hidden ? " · Hidden" : null}
                      </p>
                      <Link
                        href={`/orders/${order.id}`}
                        className="mt-1 inline-block text-xs text-v2-muted underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View detail
                      </Link>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canCancel ? (
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          className="v2-btn-sm v2-btn-outline inline-flex items-center gap-1"
                          onClick={() => void cancelOrder(order.id)}
                        >
                          {busyId === order.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Cancel
                        </button>
                      ) : null}
                      {!hidden ? (
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          className="v2-btn-sm v2-btn-sm-danger inline-flex items-center gap-1"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Hide this order? It will disappear from the user's My Orders list and will no longer sync with Lulu.",
                              )
                            ) {
                              void hideOrder(order.id);
                            }
                          }}
                        >
                          <EyeOff className="h-3.5 w-3.5" aria-hidden />
                          Hide
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
