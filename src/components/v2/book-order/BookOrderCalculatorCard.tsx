"use client";

import { Loader2 } from "lucide-react";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import { explainBookPagePadding } from "@/lib/print/bookPagePlan";
import type { BookPagePlan } from "@/lib/print/bookWizardTypes";
import { formatCredits } from "@/lib/credits/money";
import { BOOK_PAGE_COUNT_HINT, BOOK_PAGE_COUNT_LABEL } from "@/lib/print/bookPageCountCopy";

type Props = {
  plan: BookPagePlan;
  binding: BookBindingSpec;
  estimatedTotalCents: number | null;
  printCents: number | null;
  shippingCents: number | null;
  shippingZip: string;
  onShippingZipChange: (zip: string) => void;
  quoteLoading: boolean;
  quoteError?: string | null;
  quoteEnabled?: boolean;
  layout?: "stacked" | "sidebar";
};

function MoneyLine({
  label,
  cents,
  loading,
  emphasize,
}: {
  label: string;
  cents: number | null;
  loading: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className={emphasize ? "font-semibold text-v2-ink" : "text-v2-muted"}>{label}</span>
      <span
        className={
          emphasize
            ? "font-bold tabular-nums text-v2-ink"
            : "font-semibold tabular-nums text-v2-ink"
        }
      >
        {loading ? "…" : cents != null ? formatCredits(cents) : "—"}
      </span>
    </div>
  );
}

export function BookOrderCalculatorCard({
  plan,
  binding,
  estimatedTotalCents,
  printCents,
  shippingCents,
  shippingZip,
  onShippingZipChange,
  quoteLoading,
  quoteError,
  quoteEnabled = true,
  layout = "stacked",
}: Props) {
  const zipId = "book-order-shipping-zip";
  const paddingNote = explainBookPagePadding(plan.photoCount, binding, plan);
  const shellClass =
    layout === "sidebar"
      ? "flex min-h-0 flex-1 flex-col"
      : "flex flex-col border-b border-gray-200 pb-4";

  return (
    <div className={shellClass} aria-label="Book details and cost calculator">
      <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">Your book</p>
      <p className="mt-1 text-base font-bold text-v2-ink">{binding.label}</p>
      <p className="mt-0.5 text-xs text-v2-muted">8.5×11″ · B&amp;W · portrait</p>
      <p className="mt-2 text-[10px] leading-snug text-v2-muted">{BOOK_PAGE_COUNT_HINT}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-v2-muted">
            {BOOK_PAGE_COUNT_LABEL}
          </dt>
          <dd className="font-semibold tabular-nums text-v2-ink">{plan.totalPages}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-v2-muted">
            Coloring
          </dt>
          <dd className="font-semibold tabular-nums text-v2-ink">{plan.photoCount}</dd>
        </div>
        {paddingNote ? (
          <div className="col-span-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-v2-muted">
              Blank padding
            </dt>
            <dd className="text-sm font-medium text-amber-800">{paddingNote}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">
          Cost calculator
        </p>

        <div className="mt-2">
          <label htmlFor={zipId} className="text-[11px] font-semibold text-v2-muted">
            Ship to ZIP (US)
          </label>
          <input
            id={zipId}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="e.g. 90210"
            maxLength={10}
            value={shippingZip}
            onChange={(e) => onShippingZipChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium tabular-nums text-v2-ink outline-none ring-v2-primary/30 focus:ring-2"
          />
          <p className="mt-1 text-[10px] leading-snug text-v2-muted">
            Standard mail shipping from Lulu. Enter ZIP for your actual shipping charge.
          </p>
        </div>

        {!quoteEnabled ? (
          <p className="mt-3 text-xs leading-relaxed text-v2-muted">
            Add albums and arrange pages to see live Lulu pricing.
          </p>
        ) : (
          <>
            <div className="mt-3 space-y-1">
              <MoneyLine label="Printing" cents={printCents} loading={quoteLoading} />
              <MoneyLine label="Shipping" cents={shippingCents} loading={quoteLoading} />
              <MoneyLine
                label="Total"
                cents={estimatedTotalCents}
                loading={quoteLoading}
                emphasize
              />
            </div>

            {quoteLoading ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-v2-muted">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Updating quote…
              </p>
            ) : quoteError ? (
              <p className="mt-2 text-[11px] leading-snug text-amber-800">{quoteError}</p>
            ) : !shippingZip.trim() ? (
              <p className="mt-2 text-[11px] text-v2-muted">
                Default estimate ZIP until you enter yours.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
