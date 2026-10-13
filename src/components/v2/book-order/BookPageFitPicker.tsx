"use client";

import { Check } from "lucide-react";
import { BookPageImageFill } from "@/components/v2/book-order/BookPageImageFill";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import type { PageFit } from "@/lib/print/pageLayout";
import { cn } from "@/lib/cn";

type Props = {
  value: PageFit;
  onChange: (fit: PageFit) => void;
  /** One of the customer's own pages, shown both ways so the difference is plain. */
  sample: BookWizardPhotoPage;
  binding: BookBindingSpec;
};

/**
 * Framed or edge to edge, for every coloring page in the book. Each choice
 * shows the customer's own page laid out that way by the print engine.
 */
export function BookPageFitPicker({ value, onChange, sample, binding }: Props) {
  const options: { id: PageFit; title: string; body: string }[] = [
    {
      id: "framed",
      title: "Framed",
      body: "The whole picture, with a white border all the way around. Nothing is cut off.",
    },
    {
      id: "full",
      title: "Edge to edge",
      body:
        binding.id === "digital"
          ? "The picture is enlarged to fill the page, so parts that don't fit are cut off. Most home printers still leave a thin white edge."
          : "The picture is enlarged to fill the page. Parts that don't fit are cut off, along with a thin strip at every edge when the book is trimmed.",
    },
  ];

  return (
    <fieldset>
      <legend className="text-base font-semibold text-v2-ink">How should each picture sit on its page?</legend>
      <p className="mt-0.5 text-sm text-v2-muted">
        This applies to every coloring page. The pages below update to match.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Picture fit">
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={cn(
                "relative flex flex-col gap-3 rounded-2xl border-2 bg-white p-3 text-left transition sm:p-4",
                selected
                  ? "border-v2-primary shadow-[0_0_0_4px_rgb(86_79_208/0.12)]"
                  : "border-gray-200 hover:border-v2-primary/40",
              )}
            >
              <span className="mx-auto block aspect-[8.5/11] w-full max-w-44 shrink-0 overflow-hidden rounded-sm border border-gray-300 shadow-sm">
                <BookPageImageFill page={{ ...sample, fit: option.id }} binding={binding} alt="" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold text-v2-ink">{option.title}</span>
                <span className="mt-1 block text-sm leading-snug text-v2-muted">{option.body}</span>
              </span>
              <span
                className={cn(
                  "absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border-2",
                  selected ? "border-v2-primary bg-v2-primary text-white" : "border-gray-300 bg-white",
                )}
                aria-hidden
              >
                {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
