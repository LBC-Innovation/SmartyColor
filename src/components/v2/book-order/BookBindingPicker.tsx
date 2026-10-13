"use client";

import { Check, Download, Loader2, Printer } from "lucide-react";
import { DIGITAL_BOOK_CENTS } from "@/lib/credits/pricing";
import { formatCredits } from "@/lib/credits/money";
import {
  BOOK_BINDINGS,
  DIGITAL_FORMAT,
  type BookBindingId,
  type BookFormatId,
} from "@/lib/print/bookBindings";
import { cn } from "@/lib/cn";

export type BindingQuote = {
  totalCents: number | null;
  printCents: number | null;
  shippingCents: number | null;
  loading: boolean;
  error: string | null;
};

/** What one printed format costs for the book as it stands, before shipping. */
export type FormatPrice = {
  /** Printed pages the price is for, padding included. */
  pageCount: number;
  /** Everything but shipping; null while loading or when no price is available. */
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
    headline: formatCredits(DIGITAL_BOOK_CENTS),
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

/** Format cards: print-at-home PDF or one of the printed bindings. */
export function BookBindingPicker({ value, onChange, prices = {}, contentPageCount = 0 }: Props) {
  return (
    // Each card is a subgrid over three shared rows (description, price, page
    // info), so a row is as tall as its tallest card and the prices always line
    // up, however the text above or below them wraps.
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Binding">
      {CARDS.map((card) => {
        const selected = value === card.id;
        const Icon = card.digital ? Download : Printer;
        const price = card.digital ? undefined : prices[card.id as BookBindingId];
        const priced = price?.bookCents != null && !price.overCapacity;
        const pricing = Boolean(price?.loading) && !price?.overCapacity;
        const pages = price ? `${price.pageCount} page${price.pageCount === 1 ? "" : "s"}` : "";
        // What the price is for; the format's page rules follow on their own line.
        const basis = card.digital
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
            onClick={() => onChange(card.id)}
            className={cn(
              "relative row-span-3 grid grid-rows-subgrid gap-y-0 rounded-2xl border-2 bg-white p-4 text-left transition sm:p-5",
              selected
                ? "border-v2-primary shadow-[0_0_0_4px_rgb(86_79_208/0.12)]"
                : "border-gray-200 hover:border-v2-primary/40",
            )}
          >
            <span
              className={cn(
                "absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2",
                selected ? "border-v2-primary bg-v2-primary text-white" : "border-gray-300",
              )}
              aria-hidden
            >
              {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
            </span>

            <div>
              <Icon className="h-5 w-5 text-v2-primary" aria-hidden />
              <p className="mt-2 pr-8 text-lg font-bold text-v2-ink">{card.title}</p>
              <p className="mt-1 text-sm text-v2-muted">{card.blurb}</p>
            </div>

            <p className="mt-4 flex h-7 items-baseline gap-1.5 text-2xl font-bold leading-none tabular-nums text-v2-ink">
              {pricing ? (
                <span className="flex items-center gap-2 self-center text-sm font-semibold text-v2-muted" role="status">
                  <Loader2 className="h-4 w-4 animate-spin text-v2-primary" aria-hidden />
                  Getting prices…
                </span>
              ) : priced ? (
                <>
                  {formatCredits(price.bookCents!)}
                  <span className="text-sm font-semibold text-v2-muted">+ shipping</span>
                </>
              ) : card.digital ? (
                card.headline
              ) : (
                <span className="text-lg">{card.headline}</span>
              )}
            </p>
            <div className="mt-3 border-t border-gray-200 pt-3 text-xs leading-snug text-v2-muted">
              <p className="font-semibold text-v2-navy">{basis}</p>
              <p className="mt-0.5">{card.pageRule ?? card.detail}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
