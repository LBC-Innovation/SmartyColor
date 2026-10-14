"use client";

import { useEffect } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import { formatCredits } from "@/lib/credits/money";
import { formatShippingAddress } from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";

type Props = {
  open: boolean;
  busy?: boolean;
  projectTitle: string;
  binding: BookBindingSpec;
  /** Print-at-home PDF: no shipping, paid and downloaded in one step. */
  digital?: boolean;
  pageCount: number;
  photoCount: number;
  /** Printed book only: the book, shipping and sales tax that make up the total. */
  printCents?: number | null;
  shippingCents?: number | null;
  taxCents?: number | null;
  totalCents: number | null;
  shippingZip: string;
  shippingAddress?: ShippingAddress | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function BookOrderConfirmModal({
  open,
  busy,
  projectTitle,
  binding,
  digital = false,
  pageCount,
  photoCount,
  printCents = null,
  shippingCents = null,
  taxCents = null,
  totalCents,
  shippingZip,
  shippingAddress,
  onCancel,
  onConfirm,
}: Props) {
  const addressLine = formatShippingAddress(shippingAddress);
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 sm:p-6"
      role="dialog"
      aria-labelledby="book-order-confirm-title"
      aria-modal="true"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl shadow-slate-900/20"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
            <BookOpen className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="book-order-confirm-title" className="text-lg font-semibold text-v2-ink">
              {digital ? "Buy your print-at-home book?" : "Confirm your book order?"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-v2-muted">
              {digital
                ? "Your credits are charged now and the PDF downloads right away. You can download it again anytime from My orders."
                : "We'll set up the print job and take you to payment. Nothing is charged until you pay on the next screen."}
            </p>
          </div>
        </div>

        <dl className="mt-5 space-y-2 rounded-xl bg-v2-bg-subtle px-4 py-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-v2-muted">Title</dt>
            <dd className="max-w-[14rem] truncate text-right font-semibold text-v2-ink">
              {projectTitle}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-v2-muted">Binding</dt>
            <dd className="font-semibold text-v2-ink">{binding.shortLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-v2-muted">Pages</dt>
            <dd className="font-semibold tabular-nums text-v2-ink">
              {pageCount} ({photoCount} coloring)
            </dd>
          </div>
          {digital ? null : addressLine ? (
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-v2-muted">Ship to</dt>
              <dd className="text-right text-xs font-semibold leading-snug text-v2-ink sm:text-sm">
                {addressLine}
              </dd>
            </div>
          ) : shippingZip.trim() ? (
            <div className="flex justify-between gap-3">
              <dt className="text-v2-muted">Ship to ZIP</dt>
              <dd className="font-semibold tabular-nums text-v2-ink">{shippingZip.trim()}</dd>
            </div>
          ) : null}
          {digital ? null : (
            <div className="space-y-2 border-t border-gray-200/80 pt-2">
              <PriceRow label="Printing" cents={printCents} />
              <PriceRow label="Shipping" cents={shippingCents} />
              <PriceRow label="Sales tax" cents={taxCents} />
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-gray-200/80 pt-2">
            <dt className="font-semibold text-v2-ink">{digital ? "Total" : "Estimated total"}</dt>
            <dd className="font-bold tabular-nums text-v2-ink">
              {totalCents != null ? formatCredits(totalCents) : "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="v2-btn-outline min-h-11 text-sm disabled:opacity-50"
          >
            Go back
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="v2-btn-primary min-h-11 text-sm disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {digital ? "Pay & download" : "Continue to payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceRow({ label, cents }: { label: string; cents: number | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-v2-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-v2-ink">{cents != null ? formatCredits(cents) : "—"}</dd>
    </div>
  );
}
