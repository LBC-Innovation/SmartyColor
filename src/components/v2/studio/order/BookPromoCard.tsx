"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Printer, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fillCopy, numberValues } from "@/lib/marketing/copy";
import { useMarketingNumbers } from "@/lib/marketing/useMarketingNumbers";

export type BookProgress = {
  /** Steps the customer has finished, out of `total`. */
  done: number;
  total: number;
  /** "Hardcover · 24 pages", once a format is picked. */
  summary: string | null;
};

type Props = {
  pageCount: number;
  /** Up to three page pictures, front first, for the little stack of pages. */
  pictures: string[];
  /** A book already under way for this album: the card offers to pick it back up. */
  progress: BookProgress | null;
  onStart: () => void;
  /** Hides the toast; the header's book button still opens the book. */
  onDismiss: () => void;
  className?: string;
};

/** How long the gallery shows before the book toast slides in. */
const APPEAR_AFTER_MS = 2_500;

/** A small fanned stack of the album's own pages: the book they could hold. */
function PageStack({ pictures }: { pictures: string[] }) {
  const shown = pictures.slice(0, 3);
  const tilt = ["-rotate-6 -translate-x-3", "rotate-3 translate-x-2", "rotate-0"];
  return (
    <div className="relative h-20 w-[3.75rem] shrink-0" aria-hidden>
      {shown.length === 0 ? (
        <span className="absolute inset-0 rounded-md border border-gray-200 bg-white shadow-sm" />
      ) : (
        shown
          .slice()
          .reverse()
          .map((src, i, all) => (
            <span
              // Its slot in the stack: the sources are full data URLs and can repeat.
              key={all.length - i}
              className={cn(
                "absolute inset-0 overflow-hidden rounded-md border border-gray-200 bg-white shadow-md transition-transform duration-300",
                tilt[3 - all.length + i],
                "group-hover:[transform:none]",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </span>
          ))
      )}
      {/* The spine, so the stack reads as a book. */}
      <span className="absolute inset-y-0 -left-1 w-1.5 rounded-l-sm bg-v2-primary/70" />
    </div>
  );
}

/**
 * The way into a printed book, as a toast that slides into the lower right corner (above the tab
 * bar on phones) 2.5 seconds after it mounts.
 * Making pages and printing them at home stays in the gallery; this is the one, deliberate step
 * into building a book, and once a book is under way it shows how far along it is.
 */
export function BookPromoCard({ pageCount, pictures, progress, onStart, onDismiss, className }: Props) {
  const numbers = useMarketingNumbers(progress == null);
  const values = numberValues(numbers);
  const priceHint = values.price && values.refPages ? fillCopy("A {refPages}-page book is about {price} shipped.", values) : null;
  const pages = `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;
  // Give them a moment with their pages before suggesting a book.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;

  return (
    <section
      aria-label={progress ? "Your book in progress" : "Make a book"}
      className={cn(
        "v2-toast-in group fixed right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-30 w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-v2-primary/20 bg-gradient-to-br from-v2-primary-light via-white to-white px-5 py-5 shadow-xl sm:px-6 shadow-slate-900/15 lg:right-8 lg:bottom-6 xl:right-10",
        className,
      )}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="v2-hit absolute top-3 right-3 rounded-lg p-1 text-v2-muted transition hover:bg-black/5 hover:text-v2-ink"
        aria-label="Hide book suggestion"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex items-center gap-5 pr-6">
        <PageStack pictures={pictures} />
        <div className="min-w-0 flex-1">
          {progress ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-v2-primary">Your book is under way</p>
              <h2 className="mt-0.5 text-base font-semibold text-v2-ink">
                {progress.summary ?? `${pages} so far`}
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <div
                  className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-v2-primary/15"
                  role="progressbar"
                  aria-label="Book progress"
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.done}
                >
                  <div
                    className="h-full rounded-full bg-v2-primary transition-[width] duration-500"
                    style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-v2-muted">
                  {progress.done} of {progress.total} steps
                </span>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-base leading-snug font-semibold text-v2-ink">Turn these {pages} into a real book</h2>
              <p className="mt-0.5 text-sm text-v2-muted">
                Printed, bound and mailed to your door, with a cover you design.
                {priceHint ? <span className="hidden sm:inline"> {priceHint}</span> : null}
              </p>
            </>
          )}
          <button type="button" className="v2-btn-primary mt-3 min-h-10 px-4 text-sm" onClick={onStart}>
            {progress ? "Continue your book" : "Start my book"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {progress ? null : (
        <p className="mt-4 hidden items-center gap-1.5 border-t border-v2-primary/10 pt-3 text-xs text-v2-muted sm:flex">
          <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Just printing a few at home? Use the printer button on any page. No book needed.
        </p>
      )}
    </section>
  );
}
