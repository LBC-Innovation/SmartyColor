"use client";

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  projectTitle: string;
  albumNames: string[];
  reviewConfirmed: boolean;
  onReviewConfirmedChange: (checked: boolean) => void;
  savedDraftId: string | null;
  saveMessage: string | null;
  draftStale: boolean;
};

export function BookOrderReviewPanel({
  projectTitle,
  albumNames,
  reviewConfirmed,
  onReviewConfirmedChange,
  savedDraftId,
  saveMessage,
  draftStale,
}: Props) {
  return (
    <div className="v2-panel space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-v2-ink">Review before you order</h2>
        <p className="mt-1 text-sm text-v2-muted">
          Save a draft anytime, then confirm when you&apos;re ready to proceed to checkout.
        </p>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-v2-muted">Book title</dt>
          <dd className="mt-0.5 font-semibold text-v2-ink">{projectTitle}</dd>
        </div>
        {albumNames.length > 0 ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-v2-muted">Albums</dt>
            <dd className="mt-1 text-v2-ink">{albumNames.join(", ")}</dd>
          </div>
        ) : null}
      </dl>

      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition",
          reviewConfirmed
            ? "border-v2-primary/40 bg-v2-primary-light/50"
            : "border-gray-200 bg-white",
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-v2-primary"
          checked={reviewConfirmed}
          onChange={(e) => onReviewConfirmedChange(e.target.checked)}
        />
        <span className="text-sm leading-relaxed text-v2-ink">
          I&apos;ve reviewed the page order, binding, and cost estimate. I&apos;m ready to confirm
          this book for checkout.
        </span>
      </label>

      {savedDraftId ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm",
            draftStale
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900",
          )}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            {draftStale
              ? "Your draft is out of date — save again before confirming."
              : `Draft saved (order ${savedDraftId.slice(0, 8).toUpperCase()}).`}
          </p>
        </div>
      ) : null}

      {saveMessage ? (
        <p className="text-sm font-medium text-v2-link" role="status">
          {saveMessage}
        </p>
      ) : null}
    </div>
  );
}
