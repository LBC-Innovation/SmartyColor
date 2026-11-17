"use client";

import { V2ModalActions } from "@/components/v2/ui/V2Modal";
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
      className="v2-modal fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-labelledby="book-order-confirm-title"
      aria-modal="true"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        className="v2-modal-backdrop absolute inset-0 bg-v2-plum/50 backdrop-blur-sm"
        onClick={() => !busy && onCancel()}
      />
      <div className="v2-modal-panel relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-[1.75rem] bg-white ring-1 ring-v2-primary/10">
        <div className="v2-modal-strip h-1.5 w-full" aria-hidden />
        <div className="v2-modal-head flex gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-violet to-brand-blue text-white shadow-lg shadow-brand-violet/30">
            <BookOpen className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="book-order-confirm-title" className="v2-brand-title text-[1.5rem] leading-tight text-v2-ink">
              {digital ? "Buy your print-at-home book?" : "Confirm your book order?"}
            </h2>
            <p className="mt-1.5 text-base leading-relaxed text-v2-muted">
              {digital
                ? "Your credits are charged now and the PDF downloads right away. You can download it again anytime from My orders."
                : "Your credits are charged now and your book goes straight to the printer. You'll get a confirmation email, and you can follow your order's progress anytime from My orders."}
            </p>
          </div>
        </div>

        <dl className="mx-5 space-y-2.5 rounded-2xl bg-v2-primary-light/60 px-4 py-4 text-base ring-1 ring-v2-primary/10 sm:mx-7">
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
              <dd className="text-right text-sm font-semibold leading-snug text-v2-ink">
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
            <dd className="text-lg font-bold tabular-nums text-v2-primary">
              {totalCents != null ? formatCredits(totalCents) : "—"}
            </dd>
          </div>
        </dl>

        <V2ModalActions className="pt-5">
          <button type="button" disabled={busy} onClick={onCancel} className="v2-modal-btn v2-modal-btn--secondary">
            Go back
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="v2-modal-btn v2-modal-btn--primary"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            {digital ? "Pay & download" : "Confirm order"}
          </button>
        </V2ModalActions>
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
