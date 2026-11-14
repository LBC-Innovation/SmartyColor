"use client";

import { Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";

type Props = {
  signedIn: boolean;
  autoOn: boolean;
  onAutoChange: (on: boolean) => void;
  /** Credit for one new page, from the price list; null until it loads. */
  pagePriceCents: number | null;
  balanceCents: number | null;
  uploading: boolean;
  /** Pages being drawn now plus pages waiting. */
  activeCount: number;
  onStopRest?: () => void;
  queuedCount: number;
  /** Signed in, first batch on this device: how many photos are waiting on the choice. */
  choiceCount: number | null;
  onChoose: (makePages: boolean) => void;
  /** Photos the balance doesn't cover. */
  shortCount: number;
  onAddCredit: () => void;
};

/**
 * The strip that appears while photos are added or pages are being made: the "Make pages as I
 * add" switch with what it costs, a running count with Stop, and the first-time choice for people
 * with an account (credit is never spent without a clear choice).
 */
export function UploadStrip({
  signedIn,
  autoOn,
  onAutoChange,
  pagePriceCents,
  balanceCents,
  uploading,
  activeCount,
  onStopRest,
  queuedCount,
  choiceCount,
  onChoose,
  shortCount,
  onAddCredit,
}: Props) {
  const price = pagePriceCents != null ? formatCredits(pagePriceCents) : null;
  const costLine = signedIn
    ? [price ? `${price} each` : null, balanceCents != null ? `You have ${formatCredits(balanceCents)}` : null]
        .filter(Boolean)
        .join(" · ")
    : "Free to try";

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
      ) : (
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-v2-ink">Make pages as I add</span>
            <span className="block text-xs text-v2-muted">{costLine}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoOn}
            aria-label="Make pages as I add"
            onClick={() => onAutoChange(!autoOn)}
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
              autoOn ? "border-v2-primary bg-v2-primary" : "border-gray-300 bg-white",
            )}
          >
            <span
              className={cn(
                "absolute h-5 w-5 rounded-full shadow-sm transition-transform",
                autoOn ? "translate-x-6 bg-white" : "translate-x-1 bg-gray-300",
              )}
            />
          </button>
        </label>
      )}

      {uploading || activeCount > 0 ? (
        <div className="mt-2 flex min-h-9 items-center gap-2 border-t border-v2-primary/15 pt-2 text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-v2-primary motion-reduce:animate-none" aria-hidden />
          <span className="min-w-0 flex-1 text-v2-ink">
            {activeCount > 0
              ? `Making ${activeCount} ${activeCount === 1 ? "page" : "pages"}${
                  signedIn && pagePriceCents != null ? ` · ${formatCredits(pagePriceCents * activeCount)}` : ""
                }`
              : "Adding photos…"}
          </span>
          {queuedCount > 0 && onStopRest ? (
            <button type="button" className="min-h-9 shrink-0 rounded-full px-2 text-sm font-semibold text-v2-link hover:underline" onClick={onStopRest}>
              Stop the rest
            </button>
          ) : null}
        </div>
      ) : null}

      {shortCount > 0 ? (
        <p className="mt-2 border-t border-v2-primary/15 pt-2 text-sm text-v2-ink">
          <button type="button" className="font-semibold text-v2-link underline-offset-2 hover:underline" onClick={onAddCredit}>
            Add credit to make {shortCount} more
          </button>
        </p>
      ) : null}
    </div>
  );
}
