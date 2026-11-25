"use client";

import { Check, NotebookPen, Square } from "lucide-react";
import { BOOK_PACKAGES } from "@/content/marketing";
import { formatCredits } from "@/lib/credits/money";
import { cn } from "@/lib/cn";
import type { BookOrder } from "@/components/v2/studio/order/useBookOrder";

/**
 * "Leave the back of each page blank": on by default, so every picture gets a sheet to itself and
 * markers can't bleed through onto the next one. Turning it off prints both sides and costs less.
 * With it on, the backs can be lined instead, for journaling or notes, at the same price.
 */
export function BlankBacksOption({ order, className }: { order: BookOrder; className?: string }) {
  const on = order.blankBacksChoice;
  const lined = order.linedBacks;
  const extra = order.blankBacksExtraCents;
  const hint = on
    ? lined
      ? "Each picture prints on its own sheet, with writing lines on the back for a journal or notes."
      : "Each picture prints on its own sheet, so markers can't bleed through onto the next one."
    : "Pictures print on both sides of the paper, so markers can bleed through.";
  // A package is bought on the promise that each photo gets its own page with a blank back.
  const packageLocked = order.albumPurchaseCode?.source === "package" && !order.isDigital && order.bindingId === order.albumPurchaseCode.bundle.bindingId;
  // An album's purchase code includes blank or lined backs, so there is nothing to save or add.
  const money = packageLocked
    ? BOOK_PACKAGES.orderBlankBacksLocked
    : order.purchaseCode?.bundle.backsIncluded
      ? "Included with your code."
      : extra != null && extra > 0
        ? on
          ? `Turn off to save ${formatCredits(extra)}.`
          : `Adds ${formatCredits(extra)}.`
        : null;
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
        <input type="checkbox" className="h-5 w-5" checked={on} disabled={packageLocked && on} onChange={(e) => order.chooseBlankBacks(e.target.checked)} />
        Leave the back of each page blank
        {on ? (
          <span className="rounded-full bg-v2-primary-light px-1.5 py-0.5 text-[10px] font-semibold text-v2-link">Recommended</span>
        ) : null}
      </label>
      <p className="pl-7 text-xs leading-snug text-v2-muted">
        {hint}
        {money ? <span className="font-semibold text-v2-navy"> {money}</span> : null}
      </p>
      {on ? (
        <div className="mt-2 flex flex-wrap gap-2 pl-7" role="radiogroup" aria-label="Back of each page">
          {(
            [
              { id: false, label: "Blank backs", Icon: Square },
              { id: true, label: "Lined backs", Icon: NotebookPen },
            ] as const
          ).map(({ id, label, Icon }) => {
            const picked = lined === id;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() => order.chooseLinedBacks(id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition",
                  picked
                    ? "border-v2-primary bg-v2-primary-light text-v2-link"
                    : "border-gray-200 bg-white text-v2-navy hover:border-v2-primary/40",
                )}
              >
                {picked ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <Icon className="h-4 w-4 shrink-0" aria-hidden />}
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      {formatNote ? <p className="mt-1 pl-7 text-xs leading-snug text-amber-800">{formatNote}</p> : null}
    </div>
  );
}
