"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useV2Toast } from "@/components/v2/V2Toast";
import { Download, Loader2, Package, RefreshCw } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2OrderStatusBadge } from "@/components/v2/orders/V2OrderStatusBadge";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { formatDeliveryExpectation } from "@/lib/orders/fulfillmentTimeline";
import type { BookOrderSummary } from "@/lib/orders/types";

function formatMoney(cents: number | null): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function orderTitle(order: BookOrderSummary): string {
  return order.projectTitle?.trim() || order.productName;
}

export function V2MyOrdersStudio() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<BookOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const toast = useV2Toast();

  async function downloadPdf(order: BookOrderSummary) {
    setDownloadingId(order.id);
    const result = await api.downloadOrderPdf(order.id, orderTitle(order));
    setDownloadingId(null);
    if (api.isError(result)) toast.error(result.error.message);
  }

  const load = useCallback(async () => {
    if (!api.hasSessionToken()) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    const result = await api.listOrders();
    if (api.isError(result)) {
      setError(result.error.message);
      setOrders([]);
    } else {
      setOrders(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  return (
    <V2StudioFrame>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-6">
        <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 sm:py-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">
                My orders
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-v2-muted sm:text-base">
                Track printed books from payment through delivery, and re-download your
                print-at-home PDFs any time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-v2-ink transition hover:bg-v2-bg-subtle disabled:opacity-50"
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
              Refresh
            </button>
          </header>

          {authLoading ? (
            <p className="text-sm text-v2-muted">Loading account…</p>
          ) : !user ? (
            <div className="v2-panel p-6 text-center">
              <p className="text-sm text-v2-muted">Sign in to view your orders.</p>
              <Link
                href="/sign-in?next=%2Forders"
                className="mt-4 inline-flex rounded-full bg-v2-primary px-5 py-2.5 text-sm font-semibold text-white"
              >
                Sign in
              </Link>
            </div>
          ) : loading && orders.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-v2-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading orders…
            </div>
          ) : error ? (
            <div className="v2-panel border-red-200 bg-red-50/80 p-4 text-sm text-red-800">
              {error}
            </div>
          ) : orders.length === 0 ? (
            <div className="v2-panel flex flex-col items-center gap-3 p-8 text-center">
              <Package className="h-10 w-10 text-v2-muted" aria-hidden />
              <p className="text-sm font-semibold text-v2-ink">No orders yet</p>
              <p className="max-w-sm text-sm text-v2-muted">
                When you order a coloring book from the studio, it will show up here with
                delivery estimates and tracking.
              </p>
              <Link
                href="/studio"
                className="mt-2 inline-flex rounded-full bg-v2-primary px-5 py-2.5 text-sm font-semibold text-white"
              >
                Back to studio
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {orders.map((order) => (
                <li key={order.id} className="v2-panel transition hover:ring-2 hover:ring-v2-primary/20">
                  <Link href={`/orders/${order.id}`} className="block p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-v2-ink">
                          {orderTitle(order)}
                        </p>
                        <p className="mt-0.5 text-xs text-v2-muted">
                          {order.fulfillment === "digital" ? "Print at home · " : ""}
                          {order.pageCount} pages · {formatMoney(order.totalCents)} ·{" "}
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <V2OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
                    </div>
                    {order.fulfillment !== "digital" &&
                    formatDeliveryExpectation(
                      order.estimatedDeliveryMin,
                      order.estimatedDeliveryMax,
                      order.status,
                    ) ? (
                      <p className="mt-3 text-sm text-v2-muted">
                        {formatDeliveryExpectation(
                          order.estimatedDeliveryMin,
                          order.estimatedDeliveryMax,
                          order.status,
                        )}
                      </p>
                    ) : null}
                  </Link>
                  {order.fulfillment === "digital" && order.status === "paid" ? (
                    <div className="border-t border-gray-100 px-4 py-3 sm:px-5">
                      <button
                        type="button"
                        onClick={() => void downloadPdf(order)}
                        disabled={downloadingId === order.id}
                        className="v2-btn-outline h-10 text-sm"
                      >
                        {downloadingId === order.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Download className="h-4 w-4" aria-hidden />
                        )}
                        Download PDF
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </V2StudioFrame>
  );
}
