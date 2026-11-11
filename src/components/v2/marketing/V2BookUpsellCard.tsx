"use client";

import { useState } from "react";
import { BookOpen, X } from "lucide-react";
import { UPSELL } from "@/content/marketing";
import { fillCopy, readTrackIntent } from "@/lib/marketing/copy";
import { smallestPrintedBinding } from "@/lib/marketing/smallestBook";
import { trackCta } from "@/lib/track";
import { cn } from "@/lib/cn";

const DISMISSED_KEY = "cm_book_card_dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "Turn this into a book": a compact card in the studio view, under a finished coloring page. It
 * says what a book is and how many more pages the smallest printed format needs (from the binding
 * config). It sits in the page flow, so it never covers the
 * page or the action bar, and "Dismiss" hides it for the rest of the session.
 */
export function V2BookUpsellCard({
  pageCount,
  canMakeBook,
  onMakeBook,
  onAddPhotos,
  className,
}: {
  pageCount: number;
  canMakeBook: boolean;
  onMakeBook: () => void;
  onAddPhotos: () => void;
  className?: string;
}) {
  // Mounted only after the studio has loaded in the browser, so storage can be read up front.
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;

  const smallest = smallestPrintedBinding();
  const more = Math.max(0, smallest.minPages - pageCount);
  const progress =
    more === 0 ? UPSELL.enough : more === 1 ? UPSELL.needMoreOne : fillCopy(UPSELL.needMore, { more: String(more) });
  // The reference example is a different book from the smallest format, so the price stays out of
  // this card and the sentence names no format: nothing here can disagree with anything else.

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
    // The card is about to leave the page; keep keyboard and screen reader focus in the studio.
    const studio = document.querySelector<HTMLElement>('main[aria-label="Studio"]');
    studio?.setAttribute("tabindex", "-1");
    studio?.focus({ preventScroll: true });
  }

  return (
    <aside
      aria-label={UPSELL.title}
      className={cn(
        "relative mx-3 mb-3 flex shrink-0 flex-col gap-2 rounded-2xl border border-v2-primary/25 bg-v2-primary-light px-3 py-2.5 sm:mx-5 lg:mx-6 lg:mb-6",
        className,
      )}
    >
      <div className="min-w-0 pr-9">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-v2-ink">
          <BookOpen className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
          {UPSELL.title}
        </h3>
        <p className="mt-0.5 text-xs leading-snug text-v2-navy">{progress}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={UPSELL.dismiss}
        className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-full text-v2-muted hover:text-v2-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-v2-primary"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canMakeBook}
          onClick={() => {
            trackCta("upsell", readTrackIntent());
            onMakeBook();
          }}
          className="v2-btn-primary h-11 min-w-0 flex-1 whitespace-nowrap px-2 text-sm"
        >
          {UPSELL.cta}
        </button>
        <button type="button" onClick={onAddPhotos} className="v2-btn-outline h-11 min-w-0 flex-1 whitespace-nowrap px-2 text-sm">
          {UPSELL.addPhotos}
        </button>
      </div>
    </aside>
  );
}
