"use client";

import { Check } from "lucide-react";
import { BOOK_BINDINGS, type BookBindingId } from "@/lib/print/bookBindings";
import { computeBookPagePlan } from "@/lib/print/bookPagePlan";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import { cn } from "@/lib/cn";

type Props = {
  photoCount: number;
  value: BookBindingId;
  onChange: (id: BookBindingId) => void;
};

/** Two binding cards that explain, in plain words, what the user's page count becomes. */
export function BookBindingPicker({ photoCount, value, onChange }: Props) {
  // Plan math only needs the count; stub pages are fine here.
  const stub = Array.from({ length: photoCount }, (_, i) => ({ id: String(i) })) as BookWizardPhotoPage[];

  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Binding">
      {(Object.keys(BOOK_BINDINGS) as BookBindingId[]).map((id) => {
        const spec = BOOK_BINDINGS[id];
        const fits = photoCount <= spec.maxPages;
        const plan = computeBookPagePlan(stub, spec);
        const selected = value === id;

        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!fits}
            onClick={() => onChange(id)}
            className={cn(
              "relative rounded-2xl border-2 bg-white p-4 text-left transition sm:p-5",
              selected
                ? "border-v2-primary shadow-[0_0_0_4px_rgb(86_79_208/0.12)]"
                : "border-gray-200 hover:border-v2-primary/40",
              !fits && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              className={cn(
                "absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2",
                selected ? "border-v2-primary bg-v2-primary text-white" : "border-gray-300",
              )}
              aria-hidden
            >
              {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
            </span>

            <p className="pr-8 text-lg font-bold text-v2-ink">{spec.shortLabel}</p>
            <p className="mt-1 text-sm text-v2-muted">{spec.blurb}</p>

            <p className="mt-3 rounded-lg bg-v2-bg-subtle px-3 py-2 text-sm">
              {!fits ? (
                <span className="text-v2-muted">
                  Holds up to {spec.maxPages} pages — you have {photoCount}.
                </span>
              ) : (
                <>
                  <span className="font-semibold text-v2-ink">
                    {plan.totalPages}-page book
                  </span>
                  <span className="text-v2-muted">
                    {" "}
                    · {photoCount} coloring
                    {plan.blankCount > 0 ? ` + ${plan.blankCount} blank` : ""}
                  </span>
                </>
              )}
            </p>
          </button>
        );
      })}
    </div>
  );
}
