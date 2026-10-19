"use client";

import { BookOpen } from "lucide-react";
import { BOOK_NUDGE, PRICE_LINE } from "@/content/marketing";
import { fillCopy, formatUsd } from "@/lib/marketing/copy";
import { useMarketingNumbers } from "@/lib/marketing/useMarketingNumbers";
import { getBookBinding, recommendBinding } from "@/lib/print/bookBindings";

/**
 * The photo list's dock when an album has coloring pages: a short caption ("You have N pages.
 * Make them a book." plus the reference price, or progress toward the suggested format's
 * minimum) over the dock's usual primary button. The minimum comes from the binding config.
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
    // Solid card so it stands out over the list; it takes its own clicks (the dock's fade doesn't).
    <div className="pointer-events-auto flex w-full flex-col gap-2.5 rounded-2xl border border-v2-primary/25 bg-white p-2.5 shadow-[0_8px_24px_rgb(10_16_26/0.12)]">
      <p className="px-1 pt-0.5 text-center text-xs leading-snug text-v2-navy">
        <span className="font-semibold text-v2-ink">{title}</span>
        {detail ? <span className="block text-v2-muted">{detail}</span> : null}
      </p>
      <div className="flex">
        <button type="button" disabled={disabled} onClick={onMakeBook} className="v2-photo-list-dock-cta">
          <BookOpen className="h-5 w-5 shrink-0" aria-hidden />
          {BOOK_NUDGE.cta}
        </button>
      </div>
    </div>
  );
}
