"use client";

import { BookOpen } from "lucide-react";
import { BOOK_NUDGE, PRICE_LINE } from "@/content/marketing";
import { fillCopy, formatUsd } from "@/lib/marketing/copy";
import { useMarketingNumbers } from "@/lib/marketing/useMarketingNumbers";
import { getBookBinding, recommendBinding } from "@/lib/print/bookBindings";

/**
 * Album with coloring pages: "You have N pages. Make them a book." with the reference price, or
 * progress toward the suggested format's minimum. The minimum comes from the binding config.
 */
export function V2BookNudge({ pageCount, disabled, onMakeBook }: { pageCount: number; disabled?: boolean; onMakeBook: () => void }) {
  const numbers = useMarketingNumbers();
  const binding = getBookBinding(recommendBinding(pageCount));
  const underMin = pageCount < binding.minPages;
  const title = pageCount === 1 ? BOOK_NUDGE.titleOne : fillCopy(BOOK_NUDGE.title, { count: String(pageCount) });
  const detail = underMin
    ? fillCopy(BOOK_NUDGE.progress, {
        count: String(pageCount),
        min: String(binding.minPages),
        format: binding.shortLabel.toLowerCase(),
      })
    : numbers?.referencePriceCents != null
      ? fillCopy(PRICE_LINE, { price: formatUsd(numbers.referencePriceCents) })
      : null;

  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-v2-primary/25 bg-white px-3 py-2.5 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-v2-ink">{title}</p>
        {detail ? <p className="mt-0.5 text-xs leading-snug text-v2-muted">{detail}</p> : null}
      </div>
      <button type="button" disabled={disabled} onClick={onMakeBook} className="v2-btn-primary h-10 shrink-0 px-4 text-sm">
        <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
        {BOOK_NUDGE.cta}
      </button>
    </div>
  );
}
