"use client";

import { Check, Download, Printer } from "lucide-react";
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

type Props = {
  value: BookFormatId;
  onChange: (id: BookFormatId) => void;
};

type Card = {
  id: BookFormatId;
  title: string;
  blurb: string;
  headline: string;
  detail: string;
  digital?: boolean;
};

const PRINT_IDS = Object.keys(BOOK_BINDINGS) as BookBindingId[];

const CARDS: Card[] = [
  {
    id: DIGITAL_FORMAT.id,
    title: DIGITAL_FORMAT.shortLabel,
    blurb: DIGITAL_FORMAT.blurb,
    headline: formatCredits(DIGITAL_BOOK_CENTS),
    detail: "Instant PDF · any number of pages · no blank padding",
    digital: true,
  },
  ...PRINT_IDS.map((id) => {
    const spec = BOOK_BINDINGS[id];
    return {
      id,
      title: spec.shortLabel,
      blurb: spec.blurb,
      headline: "Printed & shipped",
      detail:
        spec.pageMultiple > 1
          ? `${spec.minPages}–${spec.maxPages} pages, in sets of ${spec.pageMultiple} · priced once you pick pages`
          : `${spec.minPages}–${spec.maxPages} pages · priced once you pick pages`,
    } satisfies Card;
  }),
];

/** Format cards: print-at-home PDF or one of the printed bindings. */
export function BookBindingPicker({ value, onChange }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Binding">
      {CARDS.map((card) => {
        const selected = value === card.id;
        const Icon = card.digital ? Download : Printer;
        return (
          <button
            key={card.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(card.id)}
            className={cn(
              "relative flex flex-col rounded-2xl border-2 bg-white p-4 text-left transition sm:p-5",
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

            <Icon className="h-5 w-5 text-v2-primary" aria-hidden />
            <p className="mt-2 pr-8 text-lg font-bold text-v2-ink">{card.title}</p>
            <p className="mt-1 text-sm text-v2-muted">{card.blurb}</p>
            <p className="mt-4 text-2xl font-bold leading-none tabular-nums text-v2-ink">
              {card.headline}
            </p>
            <p className="mt-1.5 text-xs text-v2-muted">{card.detail}</p>
          </button>
        );
      })}
    </div>
  );
}
