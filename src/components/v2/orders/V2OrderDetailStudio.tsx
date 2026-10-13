"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Download, ExternalLink, Loader2, Pencil, RefreshCw } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2OrderStatusBadge } from "@/components/v2/orders/V2OrderStatusBadge";
import { V2OrderTimeline } from "@/components/v2/orders/V2OrderTimeline";
import { BookOrderCheckoutPanel } from "@/components/v2/orders/BookOrderCheckoutPanel";
import { useCreditCheckoutReturn } from "@/components/v2/credits/useCreditCheckoutReturn";
import { BookShippingAddressForm } from "@/components/v2/book-order/BookShippingAddressForm";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import {
  EMPTY_SHIPPING_ADDRESS,
  isShippingAddressComplete,
  validateShippingAddress,
  type ShippingAddressErrors,
} from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import type { BookOrderDetail } from "@/lib/orders/types";

function formatAddress(a: ShippingAddress): string {
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
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const justConfirmed = searchParams.get("confirmed") === "1";
  const [order, setOrder] = useState<BookOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const purchased = searchParams.get("purchased") === "1";

  async function downloadPdf(title: string, file?: "interior" | "cover") {
    setDownloading(true);
    setError(null);
    const result = await api.downloadOrderPdf(orderId, title, file);
    setDownloading(false);
    if (api.isError(result)) setError(result.error.message);
  }

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

  useCreditCheckoutReturn({ creditedHint: "You can finish your order." });

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
                  <V2OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
                  <button
                    type="button"
                    onClick={() => void load(true)}
                    disabled={loading}
                    className="v2-hit inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-v2-ink"
                  >
                    <RefreshCw
                      className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
                      aria-hidden
                    />
                    Sync status
                  </button>
                </div>
              </header>

              {order.fulfillment === "digital" ? (
                <section className="v2-panel mb-4 border-emerald-200 bg-emerald-50/70 p-4 sm:p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-v2-muted">
                    Print at home
                  </h2>
                  <p className="mt-2 text-sm text-v2-ink">
                    {purchased
                      ? "Your book is ready and the PDF is downloading. "
                      : "Your book is ready as a PDF. "}
                    Print it on US Letter paper at 100% scale. You can download it again whenever
                    you like — it won&apos;t cost anything.
                  </p>
                  {order.status === "paid" ? (
                    <button
                      type="button"
                      onClick={() => void downloadPdf(order.projectTitle?.trim() || order.productName)}
                      disabled={downloading}
                      className="v2-btn-primary mt-4 text-sm"
                    >
                      {downloading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Download className="h-4 w-4" aria-hidden />
                      )}
                      Download PDF
                    </button>
                  ) : null}
                </section>
              ) : null}

              {justConfirmed && order.status === "awaiting_payment" ? (
                <div className="v2-panel mb-4 border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-900">
                  Your book is saved and your print job is registered. Add credits below if needed,
                  then place your order.
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
                    disabled={confirmingCheckout || !isShippingAddressComplete(order.shippingAddress)}
                    title={
                      isShippingAddressComplete(order.shippingAddress)
                        ? undefined
                        : "Add a shipping address first"
                    }
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

              {order.fulfillment !== "digital" && order.deliveryExpectation ? (
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

              {order.fulfillment !== "digital" ? (
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
              ) : null}

              {order.fulfillment !== "digital" && (order.trackingNumber || order.trackingUrls.length > 0) && (
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

              {order.fulfillment !== "digital" ? (
              <section className="v2-panel mb-4 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-v2-muted">
                    Ship to
                  </h2>
                  {order.status === "draft" || order.status === "awaiting_payment" ? (
                    <button
                      type="button"
                      onClick={() => setEditingAddress(true)}
                      className="v2-hit inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-v2-link hover:bg-v2-primary-light"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      {isShippingAddressComplete(order.shippingAddress) ? "Edit" : "Add address"}
                    </button>
                  ) : null}
                </div>
                {isShippingAddressComplete(order.shippingAddress) ? (
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-v2-ink">
                    {formatAddress(order.shippingAddress)}
                  </pre>
                ) : (
                  <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    No shipping address yet — add one before this order can go to checkout.
                  </p>
                )}
                {order.billingAddress ? (
                  <>
                    <h2 className="mt-4 text-sm font-semibold uppercase tracking-wider text-v2-muted">
                      Billing address
                    </h2>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-v2-ink">
                      {formatAddress(order.billingAddress)}
                    </pre>
                  </>
                ) : null}
              </section>
              ) : null}

              {order.fulfillment !== "digital" && order.hasPrintFiles ? (
                <section className="v2-panel mb-4 p-4 sm:p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-v2-muted">
                    Print files
                  </h2>
                  <p className="mt-2 text-sm text-v2-muted">
                    The exact files the printer receives: your cover, and every inside page.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["cover", "interior"] as const).map((file) => (
                      <button
                        key={file}
                        type="button"
                        disabled={downloading}
                        onClick={() => void downloadPdf(`${order.projectTitle?.trim() || order.productName} ${file}`, file)}
                        className="v2-btn-outline text-sm"
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        {file === "cover" ? "Cover PDF" : "Pages PDF"}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

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
      {editingAddress && order ? (
        <EditShippingAddressModal
          orderId={order.id}
          initial={order.shippingAddress}
          onClose={() => setEditingAddress(false)}
          onSaved={() => {
            setEditingAddress(false);
            void load(false);
          }}
        />
      ) : null}
    </V2StudioFrame>
  );
}

function EditShippingAddressModal({
  orderId,
  initial,
  onClose,
  onSaved,
}: {
  orderId: string;
  initial: Partial<ShippingAddress> | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [address, setAddress] = useState<ShippingAddress>({ ...EMPTY_SHIPPING_ADDRESS, ...(initial ?? {}) });
  const [errors, setErrors] = useState<ShippingAddressErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    const next = validateShippingAddress(address);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setSaveError(null);
    const result = await api.updateOrderShippingAddress(orderId, address);
    setSaving(false);
    if (api.isError(result)) {
      setSaveError(result.error.message);
      return;
    }
    onSaved();
  }

  return (
    <V2Modal
      onClose={() => !saving && onClose()}
      maxWidthClass="max-w-lg"
      title={<h2 className="text-lg font-semibold text-v2-ink">Shipping address</h2>}
    >
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <BookShippingAddressForm
          idPrefix="order-ship"
          value={address}
          onChange={(next) => {
            setAddress(next);
            if (Object.keys(errors).length > 0) setErrors(validateShippingAddress(next));
          }}
          errors={errors}
        />
        {saveError ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {saveError}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" className="v2-btn-outline" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="v2-btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save address
          </button>
        </div>
      </div>
    </V2Modal>
  );
}
