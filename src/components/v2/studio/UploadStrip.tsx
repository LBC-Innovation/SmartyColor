"use client";

import { Pencil } from "lucide-react";
import { formatCredits } from "@/lib/credits/money";

type Props = {
  /** Credit for one new page, from the price list; null until it loads. */
  pagePriceCents: number | null;
  balanceCents: number | null;
  /** Signed in, first batch on this device: how many photos are waiting on the choice. */
  choiceCount: number | null;
  onChoose: (makePages: boolean) => void;
  /** Photos the balance doesn't cover. */
  shortCount: number;
  onAddCredit: () => void;
};

/**
 * What still needs an answer after photos are added: the first-time choice for people with an
 * account (credit is never spent without a clear choice), and adding credit when it ran short.
 * Progress itself is shown by the upload progress bar.
 */
export function UploadStrip({ pagePriceCents, balanceCents, choiceCount, onChoose, shortCount, onAddCredit }: Props) {
  return (
    <div className="rounded-2xl border border-v2-primary/20 bg-v2-primary-light/60 px-3 py-2.5 sm:px-4" role="region" aria-label="Making pages">
      {choiceCount != null ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-v2-ink">
            Make {choiceCount} {choiceCount === 1 ? "page" : "pages"}
            {pagePriceCents != null ? ` · ${formatCredits(pagePriceCents * choiceCount)}` : ""}
            {balanceCents != null ? (
              <span className="block text-xs font-medium text-v2-muted">You have {formatCredits(balanceCents)}</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="v2-btn-primary min-h-11 flex-1 text-sm sm:flex-none" onClick={() => onChoose(true)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Make pages
            </button>
            <button type="button" className="v2-btn-outline min-h-11 flex-1 text-sm sm:flex-none" onClick={() => onChoose(false)}>
              Just add photos
            </button>
          </div>
        </div>
      ) : null}

      {shortCount > 0 ? (
        <p className={choiceCount != null ? "mt-2 border-t border-v2-primary/15 pt-2 text-sm text-v2-ink" : "text-sm text-v2-ink"}>
          <button type="button" className="font-semibold text-v2-link underline-offset-2 hover:underline" onClick={onAddCredit}>
            Add to your wallet to make {shortCount} more
          </button>
        </p>
      ) : null}
    </div>
  );
}
