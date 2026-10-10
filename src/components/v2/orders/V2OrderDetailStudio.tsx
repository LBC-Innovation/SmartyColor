"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2OrderStatusBadge } from "@/components/v2/orders/V2OrderStatusBadge";
import { V2OrderTimeline } from "@/components/v2/orders/V2OrderTimeline";
import { BookOrderCheckoutPanel } from "@/components/v2/orders/BookOrderCheckoutPanel";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import type { BookOrderDetail } from "@/lib/orders/types";

function formatAddress(order: BookOrderDetail): string {
  const a = order.shippingAddress;
  const lines = [
    a.name,
    a.street1,
    a.street2,
    [a.city, a.state_code, a.postcode].filter(Boolean).join(", "),
    a.country_code,
  ].filter(Boolean);
  return lines.join("\n");
}

export function V2OrderDetailStudio({ orderId }: { orderId: string }) {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const justConfirmed = searchParams.get("confirmed") === "1";
  const creditsReturn = searchParams.get("credits");
  const [order, setOrder] = useState<BookOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);

  const load = useCallback(
    async (sync = true) => {
      if (!api.hasSessionToken()) {
        setLoading(false);
        return;
      }
      setError(null);
      setLoading(true);
      const result = await api.fetchOrder(orderId, sync);
      if (api.isError(result)) {
        setError(result.error.message);
        setOrder(null);
      } else {
        setOrder(result.data);
      }
      setLoading(false);
    },
    [orderId],
  );

  useEffect(() => {
    void load(true);
  }, [load, user?.id]);

  useEffect(() => {
    if (creditsReturn === "success") {
      void refreshUser();
    }
  }, [creditsReturn, refreshUser]);

  async function confirmDraftFromDetail() {
    setConfirmingCheckout(true);
    setError(null);
    const result = await api.confirmDraftBookOrder(orderId);
    setConfirmingCheckout(false);
    if (api.isError(result)) {
      setError(result.error.message);
      return;
    }
    await load(false);
  }

  return (
    <V2StudioFrame>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-6">
        <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 sm:py-8">
          <Link
            href="/orders"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-v2-link hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All orders
          </Link>

          {authLoading ? (
            <p className="text-sm text-v2-muted">Loading account…</p>
          ) : !user ? (
            <div className="v2-panel p-6 text-center">
              <p className="text-sm text-v2-muted">Sign in to view this order.</p>
              <Link href="/sign-in" className="mt-4 inline-flex text-sm font-semibold text-v2-link">
                Sign in
              </Link>
            </div>
          ) : loading && !order ? (
            <div className="flex items-center gap-2 text-sm text-v2-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading order…
            </div>
          ) : error ? (
            <div className="v2-panel border-red-200 bg-red-50/80 p-4 text-sm text-red-800">
              {error}
            </div>
          ) : order ? (
            <>
              <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">
                    {order.projectTitle?.trim() || order.productName}
                  </h1>
                  <p className="mt-1 text-sm text-v2-muted">
                    Order {order.id.slice(0, 8).toUpperCase()} · {order.pageCount} pages
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <V2OrderStatusBadge status={order.status} />
                  <button
                    type="button"
                    onClick={() => void load(true)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-v2-ink"
                  >
                    <RefreshCw
                      className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
                      aria-hidden
                    />
                    Sync status
                  </button>
                </div>
              </header>

              {justConfirmed && order.status === "awaiting_payment" ? (
                <div className="v2-panel mb-4 border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-900">
                  Your book is saved and your print job is registered. Add credits below if needed,
                  then place your order.
                </div>
              ) : null}

              {creditsReturn === "success" && order.status === "awaiting_payment" ? (
                <div className="v2-panel mb-4 border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-900">
                  Credits added to your wallet. You can place your order when your balance covers
                  the total.
                </div>
              ) : null}

              {creditsReturn === "canceled" && order.status === "awaiting_payment" ? (
                <div className="v2-panel mb-4 border-gray-200 bg-v2-bg-subtle p-4 text-sm text-v2-muted">
                  Credit purchase canceled — your wallet was not charged.
                </div>
              ) : null}

              {order.status === "draft" ? (
                <section className="v2-panel mb-4 border-v2-primary/25 bg-v2-primary-light/30 p-4 sm:p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-v2-muted">
                    Draft saved
                  </h2>
                  <p className="mt-2 text-sm text-v2-ink">
                    Review the details below, then confirm when you&apos;re ready to order.
                    {order.totalCents != null ? (
                      <>
                        {" "}
                        Estimated total:{" "}
                        <span className="font-semibold tabular-nums">
                          {formatCredits(order.totalCents)}
                        </span>
                        .
                      </>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    disabled={confirmingCheckout}
                    onClick={() => void confirmDraftFromDetail()}
                    className="v2-btn-primary mt-4 text-sm"
                  >
                    {confirmingCheckout ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : null}
                    Confirm &amp; proceed to checkout
                  </button>
                </section>
              ) : null}

              {order.status === "awaiting_payment" ? (
                <BookOrderCheckoutPanel order={order} onOrderUpdated={() => load(false)} />
              ) : null}

              {order.deliveryExpectation ? (
                <section className="v2-panel mb-4 border-v2-primary/20 bg-v2-primary-light/40 p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-v2-muted">
                    Delivery expectation
                  </p>
                  <p className="mt-1 text-base font-semibold text-v2-ink">
                    {order.deliveryExpectation}
                  </p>
                  {order.estimatedDispatchMin && order.status !== "shipped" ? (
                    <p className="mt-2 text-sm text-v2-muted">
                      Printing usually ships by{" "}
                      {new Date(order.estimatedDispatchMax ?? order.estimatedDispatchMin).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                      .
                    </p>
                  ) : null}
                </section>
              ) : null}

              <section className="v2-panel mb-4 p-4 sm:p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-v2-muted">
                  Fulfillment
                </h2>
                <div className="mt-4">
                  <V2OrderTimeline steps={order.timeline} />
                </div>
                {order.luluStatusMessage ? (
                  <p className="mt-4 rounded-lg bg-v2-bg-subtle px-3 py-2 text-sm text-v2-muted">
                    {order.luluStatusMessage}
                  </p>
                ) : null}
              </section>

              {(order.trackingNumber || order.trackingUrls.length > 0) && (
                <section className="v2-panel mb-4 p-4 sm:p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-v2-muted">
                    Tracking
                  </h2>
                  {order.carrier ? (
                    <p className="mt-2 text-sm text-v2-ink">Carrier: {order.carrier}</p>
                  ) : null}
                  {order.trackingNumber ? (
                    <p className="mt-1 font-mono text-sm text-v2-ink">{order.trackingNumber}</p>
                  ) : null}
                  <ul className="mt-3 space-y-2">
                    {order.trackingUrls.map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-v2-link hover:underline"
                        >
                          Track package
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="v2-panel mb-4 p-4 sm:p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-v2-muted">
                  Ship to
                </h2>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-v2-ink">
                  {formatAddress(order)}
                </pre>
              </section>

              {order.events.length > 0 ? (
                <section className="v2-panel p-4 sm:p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-v2-muted">
                    Activity
                  </h2>
                  <ul className="mt-3 space-y-3">
                    {order.events.map((event) => (
                      <li key={event.id} className="border-b border-gray-100 pb-3 last:border-0">
                        <p className="text-sm font-semibold text-v2-ink">{event.title}</p>
                        {event.detail ? (
                          <p className="mt-0.5 text-sm text-v2-muted">{event.detail}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-v2-muted">
                          {new Date(event.occurredAt).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </V2StudioFrame>
  );
}
