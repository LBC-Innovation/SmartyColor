"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { Check, Download, Loader2, Printer } from "lucide-react";
import { formatCredits } from "@/lib/credits/money";
import {
  BOOK_BINDINGS,
  DIGITAL_FORMAT,
  getBookFormat,
  type BookBindingId,
  type BookFormatId,
} from "@/lib/print/bookBindings";
import { bookFormatFit, type BookFormatFit } from "@/lib/print/bookPagePlan";
import { cn } from "@/lib/cn";

export type BindingQuote = {
  totalCents: number | null;
  printCents: number | null;
  shippingCents: number | null;
  taxCents: number | null;
  loading: boolean;
  error: string | null;
};

/** What one printed format costs for the book as it stands, before shipping and tax. */
export type FormatPrice = {
  /** Printed pages the price is for, padding included. */
  pageCount: number;
  /** The book before shipping and tax; null while loading or when no price is available. */
  bookCents: number | null;
  loading: boolean;
  /** The pages already chosen don't fit this format. */
  overCapacity?: boolean;
};

type Props = {
  value: BookFormatId;
  onChange: (id: BookFormatId) => void;
  /** Live prices for the printed formats; a format without one shows no price. */
  prices?: Partial<Record<BookBindingId, FormatPrice>>;
  /** Pages the customer has chosen so far (0 before they pick any). */
  contentPageCount?: number;
  /** Format to badge as the best match for these pages. */
  recommendedId?: BookFormatId;
  /** The print-at-home PDF's price, from the price list. */
  digitalPriceCents?: number | null;
};

type Card = {
  id: BookFormatId;
  title: string;
  blurb: string;
  headline: string;
  detail: string;
  /** Page rules for a printed format, shown under its price. */
  pageRule?: string;
  digital?: boolean;
};

const PRINT_IDS = Object.keys(BOOK_BINDINGS) as BookBindingId[];

const CARDS: Card[] = [
  {
    id: DIGITAL_FORMAT.id,
    title: DIGITAL_FORMAT.shortLabel,
    blurb: DIGITAL_FORMAT.blurb,
    headline: "Print at home",
    detail: "Any number of pages · no blank padding",
    digital: true,
  },
  ...PRINT_IDS.map((id) => {
    const spec = BOOK_BINDINGS[id];
    return {
      id,
      title: spec.shortLabel,
      blurb: spec.blurb,
      headline: "Printed & shipped",
      detail: "Priced once you pick pages",
      pageRule:
        spec.pageMultiple > 1
          ? `${spec.minPages}–${spec.maxPages} pages, in sets of ${spec.pageMultiple}`
          : `${spec.minPages}–${spec.maxPages} pages`,
    } satisfies Card;
  }),
];

/** Why a format can't be picked, and what would unlock it. Shown on the card. */
function unfitReason(id: BookFormatId, fit: BookFormatFit, count: number): string {
  if (fit.tooMany) return `Holds up to ${getBookFormat(id).maxPages} pages, you have ${count}`;
  return `Needs ${fit.shortBy} more coloring ${fit.shortBy === 1 ? "page" : "pages"}`;
}

/**
 * Format cards: print-at-home PDF or one of the printed bindings. Once pages are
 * chosen, a format they wouldn't fill without a pile of blank pages stays on
 * show but can't be picked, and says what it would take to unlock it.
 */
export function BookBindingPicker({
  value,
  onChange,
  prices = {},
  contentPageCount = 0,
  recommendedId,
  digitalPriceCents = null,
}: Props) {
  const filtering = contentPageCount > 0;
  const idBase = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const isUnavailable = (card: Card) =>
    filtering && !bookFormatFit(contentPageCount, getBookFormat(card.id)).fits;
  const fitCount = CARDS.filter((c) => !isUnavailable(c)).length;
  // Best fit first, then the other printed formats that work, then those that can't be picked,
  // and print-at-home last.
  const rank = (card: Card) =>
    card.digital ? 3 : isUnavailable(card) ? 2 : card.id === recommendedId ? 0 : 1;
  const ordered = CARDS.map((card, index) => ({ card, index }))
    .sort((a, b) => rank(a.card) - rank(b.card) || a.index - b.index)
    .map(({ card }) => card);
  const selectedCard = ordered.find((c) => c.id === value && !isUnavailable(c));
  const tabStopId = (selectedCard ?? ordered.find((c) => !isUnavailable(c)))?.id;

  // Radio groups move with the arrow keys; Tab enters on the selected card only.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(event.key)) return;
    const radios = Array.from(
      groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ?? [],
    );
    const at = radios.findIndex((el) => el === document.activeElement);
    if (at < 0 || radios.length === 0) return;
    event.preventDefault();
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const target = radios[(at + step + radios.length) % radios.length];
    target.focus();
    target.click();
  }

  return (
    // Each card is a subgrid over three shared rows (description, price, page
    // info), so a row is as tall as its tallest card and the prices always line
    // up, however the text above or below them wraps.
    <div
      ref={groupRef}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      role="radiogroup"
      aria-label="Book format"
      onKeyDown={onKeyDown}
    >
      {ordered.map((card) => {
        const fit = bookFormatFit(contentPageCount, getBookFormat(card.id));
        const unavailable = filtering && !fit.fits;
        const selected = value === card.id && !unavailable;
        const Icon = card.digital ? Download : Printer;
        const price = card.digital || unavailable ? undefined : prices[card.id as BookBindingId];
        const priced = price?.bookCents != null && !price.overCapacity;
        const pricing = Boolean(price?.loading) && !price?.overCapacity;
        const pages = price ? `${price.pageCount} page${price.pageCount === 1 ? "" : "s"}` : "";
        // What the price is for; the format's page rules follow on their own line.
        const basis = unavailable
          ? unfitReason(card.id, fit, contentPageCount)
          : card.digital
            ? "Instant PDF"
            : !price
              ? card.detail
              : price.overCapacity
                ? "Your pages don't fit this format"
                : priced
                  ? contentPageCount === 0
                    ? `Smallest book, ${pages}`
                    : price.pageCount > contentPageCount
                      ? `For ${pages} (your ${contentPageCount} + ${price.pageCount - contentPageCount} blank)`
                      : `For your ${pages}`
                  : pricing
                    ? "Pricing your book"
                    : card.detail;
        return (
          <button
            key={card.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-labelledby={`${idBase}-${card.id}-title`}
            aria-describedby={`${idBase}-${card.id}-price ${idBase}-${card.id}-info`}
            tabIndex={card.id === tabStopId ? 0 : -1}
            disabled={unavailable}
            onClick={() => onChange(card.id)}
            className={cn(
              "relative row-span-3 grid grid-rows-subgrid gap-y-0 rounded-2xl border-2 p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary sm:p-5",
              unavailable
                ? "cursor-not-allowed border-gray-200 bg-v2-bg-subtle"
                : selected
                  ? "border-v2-primary bg-white shadow-[0_0_0_4px_rgb(86_79_208/0.12)]"
                  : "border-gray-200 bg-white hover:border-v2-primary/40",
            )}
          >
            <span
              className={cn(
                "absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2",
                selected ? "border-v2-primary bg-v2-primary text-white" : "border-gray-300",
                unavailable && "opacity-50",
              )}
              aria-hidden
            >
              {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
            </span>

            <div className={cn(unavailable && "opacity-50 grayscale")}>
              <span className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-v2-primary" aria-hidden />
                {card.id === recommendedId && !unavailable && fitCount > 1 ? (
                  <span className="rounded-full bg-v2-primary-light px-2 py-0.5 text-[11px] font-semibold text-v2-link">
                    Best fit
                  </span>
                ) : null}
              </span>
              <p id={`${idBase}-${card.id}-title`} className="mt-2 pr-8 text-lg font-bold text-v2-ink">
                {card.title}
              </p>
              <p className="mt-1 text-sm text-v2-muted">{card.blurb}</p>
            </div>

            <p
              id={`${idBase}-${card.id}-price`}
              className={cn(
                "mt-4 flex h-7 items-baseline gap-1.5 text-2xl font-bold leading-none tabular-nums text-v2-ink",
                unavailable && "opacity-50",
              )}
            >
              {unavailable ? (
                <span className="text-lg">Not available</span>
              ) : pricing ? (
                <span className="flex items-center gap-2 self-center text-sm font-semibold text-v2-muted" role="status">
                  <Loader2 className="h-4 w-4 animate-spin text-v2-primary" aria-hidden />
                  Getting prices…
                </span>
              ) : priced ? (
                <>
                  {formatCredits(price.bookCents!)}
                  <span className="text-sm font-semibold text-v2-muted">+ shipping &amp; tax</span>
                </>
              ) : card.digital ? (
                digitalPriceCents != null ? formatCredits(digitalPriceCents) : card.headline
              ) : (
                <span className="text-lg">{card.headline}</span>
              )}
            </p>
            {/* The reason stays at full strength so it reads as the way to unlock the card. */}
            <div id={`${idBase}-${card.id}-info`} className="mt-3 border-t border-gray-200 pt-3 text-xs leading-snug text-v2-muted">
              <p className="font-semibold text-v2-navy">{basis}</p>
              <p className="mt-0.5">{card.pageRule ?? card.detail}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
