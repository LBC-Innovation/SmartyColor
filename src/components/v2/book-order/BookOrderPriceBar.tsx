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
  const showPrice = step !== "book";

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:flex-nowrap sm:px-8 sm:py-3">
        {/* Phones: the summary gets its own row above the buttons so it never squeezes into a narrow column. */}
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          {showPrice ? (
            <div className="flex items-baseline justify-between gap-3 sm:block">
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
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2 sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-v2-muted">
                Your book
              </p>
              <p className="text-sm font-semibold leading-tight tabular-nums text-v2-ink">
                {photoCount === 0
                  ? "Choose an album to start"
                  : `${photoCount} coloring page${photoCount === 1 ? "" : "s"}`}
                {pageCount > photoCount && photoCount > 0 ? (
                  <span className="font-medium text-v2-muted"> · {pageCount} printed</span>
                ) : null}
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || busy}
          className="v2-btn-primary h-11 min-w-0 flex-1 px-5 sm:flex-none"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {nextLabel}
          {step !== "review" ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
        </button>
      </div>
    </div>
  );
}
