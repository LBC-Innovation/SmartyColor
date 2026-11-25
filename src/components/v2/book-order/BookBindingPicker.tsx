"use client";

import { useId, useMemo, useRef, type KeyboardEvent } from "react";
import { Check, Download, Loader2 } from "lucide-react";
import { formatCredits } from "@/lib/credits/money";
import {
  BINDING_PHOTOS,
  BOOK_BINDINGS,
  DIGITAL_FORMAT,
  getBookFormat,
  withBlankBacks,
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
  /** The printer's estimated delivery window (YYYY-MM-DD), when the quote came with one. */
  deliveryMin?: string | null;
  deliveryMax?: string | null;
  /** Part of the total the album's purchase code pays, when it has one. */
  coveredCents?: number | null;
};

/** What one printed format costs for the book as it stands, before shipping and tax. */
export type FormatPrice = {
  /** Printed sides the price is for, padding and blank backs included. */
  pageCount: number;
  /** Pages the customer sees in that book, padding included (the fronts, with blank backs); `pageCount` when absent. */
  frontCount?: number;
  /** The book before shipping and tax; null while loading or when no price is available. */
  bookCents: number | null;
  loading: boolean;
  /** The pages already chosen don't fit this format. */
  overCapacity?: boolean;
};

type Props = {
  /** Null while nothing is picked: no card is selected and the first available one takes Tab. */
  value: BookFormatId | null;
  /** `via` says whether a click/Enter picked it or an arrow key moved through the group. */
  onChange: (id: BookFormatId, via: "click" | "arrow") => void;
  /** Live prices for the printed formats; a format without one shows no price. */
  prices?: Partial<Record<BookBindingId, FormatPrice>>;
  /** Pages the customer has chosen so far (0 before they pick any). */
  contentPageCount?: number;
  /** Format to badge as the best match for these pages. */
  recommendedId?: BookFormatId;
  /** The print-at-home PDF's price, from the price list. */
  digitalPriceCents?: number | null;
  /** "list" stacks the cards in one column, for narrow panels and sheets. */
  layout?: "grid" | "list";
  /** Each page printed on its own sheet with a blank back: the printed formats hold half as many. */
  blankBacks?: boolean;
  /** The binding the album's purchase code pays for: shown as included, the others as extra. */
  includedId?: BookBindingId | null;
  /** What to say under the included binding instead of "Paid by your code" (a book package). */
  includedNote?: string;
  /** The included binding is a package: other bindings show their whole price, not a difference. */
  packageIncluded?: boolean;
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

function formatCards(blankBacks: boolean): Card[] {
  return [
    {
      id: DIGITAL_FORMAT.id,
      title: DIGITAL_FORMAT.shortLabel,
      blurb: DIGITAL_FORMAT.blurb,
      headline: "Print at home",
      detail: "Any number of pages",
      digital: true,
    },
    ...PRINT_IDS.map((id) => {
      const spec = withBlankBacks(BOOK_BINDINGS[id], blankBacks);
      return {
        id,
        title: spec.shortLabel,
        blurb: spec.blurb,
        headline: "Printed & shipped",
        detail: "Priced once you pick pages",
        pageRule:
          spec.pageMultiple > 2
            ? `${spec.minPages}–${spec.maxPages} pages, in sets of ${spec.pageMultiple}`
            : `${spec.minPages}–${spec.maxPages} pages`,
      } satisfies Card;
    }),
  ];
}

/**
 * A photo of the binding (decorative: the title names it), or a download tile for the PDF, so
 * every row lines up.
 */
function FormatThumb({ id, className }: { id: BookFormatId; className?: string }) {
  const photo = id === "digital" ? null : BINDING_PHOTOS[id];
  return (
    <span
      className={cn("block shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-v2-bg-subtle", className)}
      style={{ aspectRatio: "16 / 9" }}
      aria-hidden
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.src} alt="" width={photo.width} height={photo.height} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-v2-primary-light text-v2-primary">
          <Download className="h-5 w-5" />
        </span>
      )}
    </span>
  );
}

/** Why a format can't be picked, and what would unlock it. Shown on the card. */
function unfitReason(id: BookFormatId, fit: BookFormatFit, count: number, blankBacks: boolean): string {
  if (fit.tooMany) {
    return `Holds up to ${getBookFormat(id, blankBacks).maxPages} pages${blankBacks ? " with blank backs" : ""}, you have ${count}`;
  }
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
  layout = "grid",
  blankBacks = false,
  includedId = null,
  includedNote,
  packageIncluded = false,
}: Props) {
  const includedPrice = includedId ? prices[includedId] : undefined;
  const CARDS = useMemo(() => formatCards(blankBacks), [blankBacks]);
  const filtering = contentPageCount > 0;
  const idBase = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const isUnavailable = (card: Card) =>
    filtering && !bookFormatFit(contentPageCount, getBookFormat(card.id, blankBacks)).fits;
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
    const id = target.dataset.formatId as BookFormatId | undefined;
    if (id) onChange(id, "arrow");
  }

  return (
    // Each card is a subgrid over three shared rows (description, price, page
    // info), so a row is as tall as its tallest card and the prices always line
    // up, however the text above or below them wraps.
    <div
      ref={groupRef}
      className={layout === "list" ? "grid gap-2" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"}
      role="radiogroup"
      aria-label="Book format"
      onKeyDown={onKeyDown}
    >
      {ordered.map((card) => {
        const fit = bookFormatFit(contentPageCount, getBookFormat(card.id, blankBacks));
        const unavailable = filtering && !fit.fits;
        const selected = value === card.id && !unavailable;
        const price = card.digital || unavailable ? undefined : prices[card.id as BookBindingId];
        const priced = price?.bookCents != null && !price.overCapacity;
        const pricing = Boolean(price?.loading) && !price?.overCapacity;
        const shownPages = price ? (price.frontCount ?? price.pageCount) : 0;
        const pages = price ? `${shownPages} page${shownPages === 1 ? "" : "s"}` : "";
        // What the price is for; the format's page rules follow on their own line.
        const basis = unavailable
          ? unfitReason(card.id, fit, contentPageCount, blankBacks)
          : card.digital
            ? "Instant PDF"
            : !price
              ? card.detail
              : price.overCapacity
                ? "Your pages don't fit this format"
                : priced
                  ? contentPageCount === 0
                    ? `Smallest book, ${pages}`
                    : shownPages > contentPageCount
                      ? `${pages}: your ${contentPageCount} and ${shownPages - contentPageCount} blank`
                      : `For your ${pages}`
                  : pricing
                    ? "Pricing your book"
                    : card.detail;
        if (layout === "list") {
          // Compact row for the narrow order panel: title and price on one line, then one short
          // description and one line of page facts.
          const facts = unavailable
            ? basis
            : priced
              ? basis
              : [card.digital ? "Instant PDF" : card.headline, card.pageRule ?? card.detail].filter(Boolean).join(" · ");
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
              data-format-id={card.id}
              onClick={() => onChange(card.id, "click")}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary",
                unavailable
                  ? "cursor-not-allowed border-gray-200 bg-v2-bg-subtle"
                  : selected
                    ? "border-v2-primary bg-white shadow-[0_0_0_3px_rgb(86_79_208/0.12)]"
                    : "border-gray-200 bg-white hover:border-v2-primary/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  selected ? "border-v2-primary bg-v2-primary text-white" : "border-gray-300",
                  unavailable && "opacity-50",
                )}
                aria-hidden
              >
                {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <FormatThumb id={card.id} className={cn("w-20 sm:w-24", unavailable && "opacity-50 grayscale")} />
              <span className={cn("min-w-0 flex-1", unavailable && "opacity-60")}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span id={`${idBase}-${card.id}-title`} className="truncate text-base font-bold text-v2-ink">
                      {card.title}
                    </span>
                    {card.id === recommendedId && !unavailable && fitCount > 1 ? (
                      <span className="shrink-0 rounded-full bg-v2-primary-light px-1.5 py-0.5 text-[10px] font-semibold text-v2-link">
                        Best fit
                      </span>
                    ) : null}
                  </span>
                  <span id={`${idBase}-${card.id}-price`} className="shrink-0 text-right tabular-nums">
                    {unavailable ? null : pricing ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-v2-muted" role="status">
                        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none text-v2-primary" aria-hidden />
                        Pricing…
                      </span>
                    ) : card.id === includedId ? (
                      <span className="text-base font-bold text-v2-success-text">Included</span>
                    ) : priced && includedId && packageIncluded ? (
                      <span className="text-base font-bold text-v2-ink">{formatCredits(price.bookCents!)}</span>
                    ) : priced && includedId ? (
                      includedPrice?.bookCents != null ? (
                        price.bookCents! > includedPrice.bookCents ? (
                          <span className="text-sm font-bold text-v2-ink">
                            +{formatCredits(price.bookCents! - includedPrice.bookCents)} extra
                          </span>
                        ) : (
                          <span className="text-sm font-bold text-v2-ink">Upgrade for no extra cost</span>
                        )
                      ) : (
                        <span className="text-sm font-bold text-v2-ink">Extra cost</span>
                      )
                    ) : card.digital && includedId ? (
                      <span className="text-sm font-bold text-v2-ink">Not included</span>
                    ) : priced ? (
                      <span className="text-base font-bold text-v2-ink">{formatCredits(price.bookCents!)}</span>
                    ) : card.digital && digitalPriceCents != null ? (
                      <span className="text-base font-bold text-v2-ink">{formatCredits(digitalPriceCents)}</span>
                    ) : null}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-v2-muted line-clamp-2">{card.blurb}</span>
                <span id={`${idBase}-${card.id}-info`} className="mt-1 flex items-baseline justify-between gap-2 text-xs leading-snug">
                  <span className={cn("min-w-0", unavailable ? "font-semibold text-v2-navy" : "text-v2-muted")}>{facts}</span>
                  {card.id === includedId ? (
                    <span className="shrink-0 text-v2-success-text">{includedNote ?? "Paid by your code"}</span>
                  ) : priced && !includedId ? (
                    <span className="shrink-0 text-v2-muted">+ shipping &amp; tax</span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        }
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
            data-format-id={card.id}
            onClick={() => onChange(card.id, "click")}
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
                "absolute right-6 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm sm:right-7 sm:top-7",
                selected ? "border-v2-primary bg-v2-primary text-white" : "border-gray-300 bg-white",
                unavailable && "opacity-50",
              )}
              aria-hidden
            >
              {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
            </span>

            <div className={cn(unavailable && "opacity-50 grayscale")}>
              <FormatThumb id={card.id} className="mb-3 w-full" />
              <span className="flex min-h-5 items-center gap-2">
                {card.id === recommendedId && !unavailable && fitCount > 1 ? (
                  <span className="rounded-full bg-v2-primary-light px-2 py-0.5 text-[11px] font-semibold text-v2-link">
                    Best fit
                  </span>
                ) : null}
              </span>
              <p id={`${idBase}-${card.id}-title`} className="mt-1 text-lg font-bold text-v2-ink">
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
              {unavailable ? null : pricing ? (
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
              {priced ? null : <p className="mt-0.5">{card.pageRule ?? card.detail}</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
