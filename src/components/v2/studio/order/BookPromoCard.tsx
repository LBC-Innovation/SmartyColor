"use client";

import { ArrowRight, Printer } from "lucide-react";
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
  className?: string;
};

/** A small fanned stack of the album's own pages: the book they could hold. */
function PageStack({ pictures }: { pictures: string[] }) {
  const shown = pictures.slice(0, 3);
  const tilt = ["-rotate-6 -translate-x-3", "rotate-3 translate-x-2", "rotate-0"];
  return (
    <div className="relative h-24 w-[4.5rem] shrink-0 sm:h-28 sm:w-20" aria-hidden>
      {shown.length === 0 ? (
        <span className="absolute inset-0 rounded-md border border-gray-200 bg-white shadow-sm" />
      ) : (
        shown
          .slice()
          .reverse()
          .map((src, i, all) => (
            <span
              key={src}
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
 * The way into a printed book, at the top of the gallery. Making pages and printing them at home
 * stays in the gallery; this card is the one, deliberate step into building a book, and once a
 * book is under way it shows how far along it is.
 */
export function BookPromoCard({ pageCount, pictures, progress, onStart, className }: Props) {
  const numbers = useMarketingNumbers(progress == null);
  const values = numberValues(numbers);
  const priceHint = values.price && values.refPages ? fillCopy("A {refPages}-page book is about {price} shipped.", values) : null;
  const pages = `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;

  return (
    <section
      aria-label={progress ? "Your book in progress" : "Make a book"}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-v2-primary/20 bg-gradient-to-br from-v2-primary-light via-white to-white p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex items-center gap-4 sm:gap-5">
        <PageStack pictures={pictures} />
        <div className="min-w-0 flex-1">
          {progress ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-v2-primary">Your book is under way</p>
              <h2 className="mt-0.5 text-base font-semibold text-v2-ink sm:text-lg">
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
              <h2 className="text-base font-semibold text-v2-ink sm:text-lg">Turn these {pages} into a real book</h2>
              <p className="mt-0.5 text-sm text-v2-muted">
                Printed, bound and mailed to your door, with a cover you design.
                {priceHint ? <span className="hidden sm:inline"> {priceHint}</span> : null}
              </p>
            </>
          )}
          <button type="button" className="v2-btn-primary mt-3 min-h-11 px-5 text-sm" onClick={onStart}>
            {progress ? "Continue your book" : "Start my book"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {progress ? null : (
        <p className="mt-3 flex items-center gap-1.5 border-t border-v2-primary/10 pt-2.5 text-xs text-v2-muted">
          <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Just printing a few at home? Use the printer button on any page. No book needed.
        </p>
      )}
    </section>
  );
}
