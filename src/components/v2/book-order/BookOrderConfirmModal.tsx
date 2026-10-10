"use client";

import { useEffect } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import { formatCredits } from "@/lib/credits/money";
import { BOOK_PAGE_COUNT_HINT } from "@/lib/print/bookPageCountCopy";

type Props = {
  open: boolean;
  busy?: boolean;
  projectTitle: string;
  binding: BookBindingSpec;
  pageCount: number;
  photoCount: number;
  totalCents: number | null;
  shippingZip: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function BookOrderConfirmModal({
  open,
  busy,
  projectTitle,
  binding,
  pageCount,
  photoCount,
  totalCents,
  shippingZip,
  onCancel,
  onConfirm,
}: Props) {
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
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl shadow-slate-900/20"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
            <BookOpen className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="book-order-confirm-title" className="text-lg font-semibold text-v2-ink">
              Confirm your book order?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-v2-muted">
              We&apos;ll save your book, register the print job, and take you to checkout. You can
              still view it in
              My Orders before payment is complete.
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
            <dd className="font-semibold text-v2-ink">{binding.label}</dd>
          </div>
          <div>
            <div className="flex justify-between gap-3">
              <dt className="text-v2-muted">Pages (sides)</dt>
              <dd className="font-semibold tabular-nums text-v2-ink">
                {pageCount} ({photoCount} coloring)
              </dd>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-v2-muted">{BOOK_PAGE_COUNT_HINT}</p>
          </div>
          {shippingZip.trim() ? (
            <div className="flex justify-between gap-3">
              <dt className="text-v2-muted">Ship to ZIP</dt>
              <dd className="font-semibold tabular-nums text-v2-ink">{shippingZip.trim()}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-gray-200/80 pt-2">
            <dt className="font-semibold text-v2-ink">Estimated total</dt>
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
            Save &amp; confirm order
          </button>
        </div>
      </div>
    </div>
  );
}
