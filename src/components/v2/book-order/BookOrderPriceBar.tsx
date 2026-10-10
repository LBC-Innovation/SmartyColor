"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { formatCredits } from "@/lib/credits/money";
import type { BookOrderStep } from "@/components/v2/book-order/BookOrderStepper";

type Props = {
  step: BookOrderStep;
  totalCents: number | null;
  quoteLoading: boolean;
  pageCount: number;
  photoCount: number;
  backLabel: string;
  nextLabel: string;
  nextDisabled?: boolean;
  busy?: boolean;
  onBack: () => void;
  onNext: () => void;
};

/** Sticky footer: running total on the left, Back / primary action on the right. */
export function BookOrderPriceBar({
  step,
  totalCents,
  quoteLoading,
  pageCount,
  photoCount,
  backLabel,
  nextLabel,
  nextDisabled,
  busy,
  onBack,
  onNext,
}: Props) {
  const showPrice = step !== "pages";

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-8 sm:py-3">
        <div className="min-w-0 flex-1">
          {showPrice ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-v2-muted">
                Estimated total
              </p>
              <p className="text-lg font-bold leading-tight tabular-nums text-v2-ink">
                {quoteLoading ? (
                  <span className="inline-flex items-center gap-1.5 text-v2-muted">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Pricing…
                  </span>
                ) : totalCents != null ? (
                  formatCredits(totalCents)
                ) : (
                  "—"
                )}
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-v2-muted">
                Your book
              </p>
              <p className="text-sm font-semibold leading-tight tabular-nums text-v2-ink">
                {photoCount === 0
                  ? "No pages yet"
                  : `${photoCount} coloring page${photoCount === 1 ? "" : "s"}`}
                {pageCount > photoCount && photoCount > 0 ? (
                  <span className="font-medium text-v2-muted"> · {pageCount} printed</span>
                ) : null}
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || busy}
          className="v2-btn-primary h-11 shrink-0 px-5"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {nextLabel}
          {step !== "review" ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
        </button>
      </div>
    </div>
  );
}
