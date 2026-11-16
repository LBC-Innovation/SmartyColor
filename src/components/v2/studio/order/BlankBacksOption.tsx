"use client";

import { formatCredits } from "@/lib/credits/money";
import type { BookOrder } from "@/components/v2/studio/order/useBookOrder";

/**
 * "Leave the back of each page blank": on by default, so every picture gets a sheet to itself and
 * markers can't bleed through onto the next one. Turning it off prints both sides and costs less.
 */
export function BlankBacksOption({ order, className }: { order: BookOrder; className?: string }) {
  const on = order.blankBacksChoice;
  const extra = order.blankBacksExtraCents;
  const hint = on
    ? "Each picture prints on its own sheet, so markers can't bleed through onto the next one."
    : "Pictures print on both sides of the paper, so markers can bleed through.";
  const money =
    extra != null && extra > 0 ? (on ? `Turn off to save ${formatCredits(extra)}.` : `Adds ${formatCredits(extra)}.`) : null;
  // The other way may not suit the chosen format: halving or doubling the sheets can cross its limits.
  const formatNote =
    order.formatChosen && !order.isDigital && !order.otherBacksFits
      ? on
        ? `Without blank backs your pages are too few for a ${order.binding.shortLabel.toLowerCase()}.`
        : `With blank backs a ${order.binding.shortLabel.toLowerCase()} holds up to ${Math.floor(order.binding.maxPages / 2)} pages.`
      : null;

  return (
    <div className={className ?? "rounded-xl border border-gray-200 bg-v2-bg-subtle/60 p-3"}>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-v2-navy">
        <input type="checkbox" className="h-5 w-5" checked={on} onChange={(e) => order.chooseBlankBacks(e.target.checked)} />
        Leave the back of each page blank
        {on ? (
          <span className="rounded-full bg-v2-primary-light px-1.5 py-0.5 text-[10px] font-semibold text-v2-link">Recommended</span>
        ) : null}
      </label>
      <p className="pl-7 text-xs leading-snug text-v2-muted">
        {hint}
        {money ? <span className="font-semibold text-v2-navy"> {money}</span> : null}
      </p>
      {formatNote ? <p className="mt-1 pl-7 text-xs leading-snug text-amber-800">{formatNote}</p> : null}
    </div>
  );
}
