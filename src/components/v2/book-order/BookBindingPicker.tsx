"use client";

import { Check, CircleDollarSign, Loader2 } from "lucide-react";
import { BOOK_BINDINGS, type BookBindingId } from "@/lib/print/bookBindings";
import { computeBookPagePlan } from "@/lib/print/bookPagePlan";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import { formatCredits } from "@/lib/credits/money";
import { cn } from "@/lib/cn";

export type BindingQuote = {
  totalCents: number | null;
  printCents: number | null;
  shippingCents: number | null;
  loading: boolean;
  error: string | null;
};

type Props = {
  photoCount: number;
  value: BookBindingId;
  onChange: (id: BookBindingId) => void;
  quotes: Partial<Record<BookBindingId, BindingQuote>>;
  /** Wallet balance; null when signed out / unknown. */
  balanceCents: number | null;
  onAddCredit: (shortfallCents: number) => void;
};

/** Binding cards with live price; unaffordable ones are disabled with a one-tap top-up. */
export function BookBindingPicker({ photoCount, value, onChange, quotes, balanceCents, onAddCredit }: Props) {
  const stub = Array.from({ length: photoCount }, (_, i) => ({ id: String(i), kind: "photo" })) as BookWizardPhotoPage[];

  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Binding">
      {(Object.keys(BOOK_BINDINGS) as BookBindingId[]).map((id) => {
        const spec = BOOK_BINDINGS[id];
        const fits = photoCount <= spec.maxPages;
        const plan = computeBookPagePlan(stub, spec);
        const quote = quotes[id];
        const total = quote?.totalCents ?? null;
        const shortfall = total != null && balanceCents != null ? Math.max(0, total - balanceCents) : 0;
        const unaffordable = fits && shortfall > 0;
        const disabled = !fits || unaffordable;
        const selected = value === id;

        return (
          <div
            key={id}
            className={cn(
              "relative flex flex-col rounded-2xl border-2 bg-white transition",
              selected && !disabled
                ? "border-v2-primary shadow-[0_0_0_4px_rgb(86_79_208/0.12)]"
                : "border-gray-200",
              !disabled && !selected && "hover:border-v2-primary/40",
              disabled && "bg-v2-bg-subtle/60",
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected && !disabled}
              disabled={disabled}
              onClick={() => onChange(id)}
              className="flex-1 rounded-2xl p-4 text-left disabled:cursor-not-allowed sm:p-5"
            >
              <span
                className={cn(
                  "absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2",
                  selected && !disabled ? "border-v2-primary bg-v2-primary text-white" : "border-gray-300",
                  disabled && "opacity-40",
                )}
                aria-hidden
              >
                {selected && !disabled ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
              </span>

              <p className={cn("pr-8 text-lg font-bold", disabled ? "text-v2-muted" : "text-v2-ink")}>
                {spec.shortLabel}
              </p>
              <p className="mt-1 text-sm text-v2-muted">{spec.blurb}</p>

              {/* price — the headline of the card */}
              <div className="mt-4">
                {!fits ? (
                  <p className="text-sm text-v2-muted">
                    Holds up to {spec.maxPages} pages — you have {photoCount}.
                  </p>
                ) : quote?.loading || !quote ? (
                  <p className="inline-flex items-center gap-2 text-2xl font-bold text-v2-muted">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Pricing…
                  </p>
                ) : total != null ? (
                  <>
                    <p className={cn("text-3xl font-bold tabular-nums leading-none", disabled ? "text-v2-muted" : "text-v2-ink")}>
                      {formatCredits(total)}
                    </p>
                    <p className="mt-1.5 text-xs text-v2-muted tabular-nums">
                      {quote.printCents != null ? `${formatCredits(quote.printCents)} printing` : ""}
                      {quote.printCents != null && quote.shippingCents != null ? " + " : ""}
                      {quote.shippingCents != null ? `${formatCredits(quote.shippingCents)} shipping` : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-amber-800">{quote.error ?? "Price unavailable right now."}</p>
                )}
              </div>

              <p className="mt-3 text-xs text-v2-muted">
                <span className="font-semibold text-v2-navy">{plan.totalPages}-page book</span> · {photoCount} coloring
                {plan.blankCount > 0 ? ` + ${plan.blankCount} blank` : ""}
              </p>
            </button>

            {unaffordable ? (
              <div className="border-t border-gray-200 px-4 py-3 sm:px-5">
                <p className="text-xs text-v2-muted">
                  You have <span className="font-semibold tabular-nums text-v2-ink">{formatCredits(balanceCents ?? 0)}</span> ·
                  need <span className="font-semibold tabular-nums text-v2-ink">{formatCredits(shortfall)}</span> more
                </p>
                <button
                  type="button"
                  onClick={() => onAddCredit(shortfall)}
                  className="v2-btn-primary mt-2 h-10 w-full text-sm"
                >
                  <CircleDollarSign className="h-4 w-4" aria-hidden />
                  Add {formatCredits(shortfall)} credit
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
