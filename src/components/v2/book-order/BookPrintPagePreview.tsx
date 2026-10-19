"use client";

import { BookLinedPageArt } from "@/components/v2/book-order/BookLinedPageArt";
import { BookNotePageArt } from "@/components/v2/book-order/BookNotePageArt";
import { BookPageImageFill } from "@/components/v2/book-order/BookPageImageFill";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import type { BookWizardPage } from "@/lib/print/bookWizardTypes";
import {
  BOOK_BLEED_IN,
  BOOK_TRIM_HEIGHT_IN,
  BOOK_TRIM_WIDTH_IN,
  PRINT_MARGIN_IN,
} from "@/lib/print/pageLayout";
import { cn } from "@/lib/cn";

type Props = {
  page: BookWizardPage | null;
  pageNumber: number;
  binding: BookBindingSpec;
  side: "left" | "right";
  className?: string;
  /** Pages in the finished book; set it to preview the paperback gutter. */
  totalPages?: number;
  /** Draw the trim line and the safe margin, on the sheet as it is printed before trimming. */
  showGuides?: boolean;
};

const pct = (part: number, whole: number) => `${(part / whole) * 100}%`;

export function BookPrintPagePreview({
  page,
  pageNumber,
  binding,
  side,
  className,
  totalPages,
  showGuides = false,
}: Props) {
  // With guides on, a printed book shows the oversize sheet the printer trims
  // down; a print-at-home page has no trim, only the margin.
  const bleed = showGuides && binding.id !== "digital" ? BOOK_BLEED_IN : 0;
  const sheetW = BOOK_TRIM_WIDTH_IN + bleed * 2;
  const sheetH = BOOK_TRIM_HEIGHT_IN + bleed * 2;
  const inset = {
    left: pct(bleed, sheetW),
    right: pct(bleed, sheetW),
    top: pct(bleed, sheetH),
    bottom: pct(bleed, sheetH),
  };
  const safe = bleed + PRINT_MARGIN_IN;

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      <p className="mb-1 text-center text-[10px] font-semibold tabular-nums text-v2-muted">
        {side === "right" ? "Right" : "Left"} · Page {pageNumber}
      </p>
      {/* The sheet of paper itself, at its true shape and with nothing around
          it, so an edge-to-edge page visibly reaches every edge. */}
      <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
        <div
          className="relative overflow-hidden rounded-sm bg-white shadow-md ring-1 ring-gray-300"
          style={{
            aspectRatio: `${sheetW} / ${sheetH}`,
            width: `min(100cqw, calc(100cqh * ${sheetW} / ${sheetH}))`,
          }}
        >
          <div className="absolute" style={inset}>
            {!page ? (
              <span className="flex h-full w-full items-center justify-center text-xs text-v2-muted">—</span>
            ) : page.kind === "note" ? (
              <BookNotePageArt text={page.text} />
            ) : page.kind === "blank" && page.variant === "lined" ? (
              <BookLinedPageArt />
            ) : page.kind === "blank" ? (
              <div className="flex h-full w-full flex-col items-center justify-center text-v2-muted">
                <p className="text-xs font-semibold">Blank</p>
              </div>
            ) : (
              <BookPageImageFill
                page={page}
                binding={binding}
                bookPosition={totalPages ? { pageNumber, totalPages } : undefined}
                showOverflow={bleed > 0}
              />
            )}
          </div>
          {showGuides ? (
            <>
              {bleed > 0 ? (
                <div className="pointer-events-none absolute border border-dashed border-red-500" style={inset} aria-hidden />
              ) : null}
              <div
                className="pointer-events-none absolute border border-dotted border-sky-500"
                style={{
                  left: pct(safe, sheetW),
                  right: pct(safe, sheetW),
                  top: pct(safe, sheetH),
                  bottom: pct(safe, sheetH),
                }}
                aria-hidden
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
