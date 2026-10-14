"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BookPrintGuidesToggle } from "@/components/v2/book-order/BookPrintGuidesToggle";
import { BookPrintPagePreview } from "@/components/v2/book-order/BookPrintPagePreview";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import { BOOK_PAGE_COUNT_HINT } from "@/lib/print/bookPageCountCopy";
import { bookSpreadCount, getBookPageSpread } from "@/lib/print/bookPagePlan";
import type { BookWizardPage } from "@/lib/print/bookWizardTypes";
import { V2Modal } from "@/components/v2/ui/V2Modal";

type Props = {
  pages: BookWizardPage[];
  binding: BookBindingSpec;
  onClose: () => void;
};

function useIsWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

export function BookFlipThroughModal({ pages, binding, onClose }: Props) {
  const wide = useIsWide();
  const spreadTotal = useMemo(() => bookSpreadCount(pages.length), [pages.length]);
  // Phones page one side at a time; wider screens show the open-book spread.
  const stepTotal = wide ? spreadTotal : pages.length;
  const [rawPos, setPos] = useState(0);
  const [showGuides, setShowGuides] = useState(true);
  // Clamp at render so a shrinking page list never leaves us past the end.
  const pos = Math.min(rawPos, Math.max(0, stepTotal - 1));
  const spreadIndex = wide ? pos : Math.floor(pos / 2);
  const spread = getBookPageSpread(pages, spreadIndex);
  const singlePage = pages[pos] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setPos((i) => Math.min(stepTotal - 1, i + 1));
      if (e.key === "ArrowLeft") setPos((i) => Math.max(0, i - 1));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, stepTotal]);

  const title = !wide
    ? `Page ${pos + 1} of ${pages.length}`
    : spread.left && spread.right
      ? `Pages ${spread.rightPageNumber}–${spread.leftPageNumber} of ${pages.length}`
      : `Page ${spread.rightPageNumber} of ${pages.length}`;

  return (
    <V2Modal onClose={onClose} maxWidthClass="max-w-6xl" title={title} fill>
      {/* The pages take every bit of height the controls don't need, so the
          whole preview fits the window without scrolling. */}
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2 sm:px-5 sm:pb-4">
        <div className="mx-auto flex min-h-[18rem] w-full flex-1 items-stretch justify-center gap-2 rounded-xl border border-gray-300 bg-gradient-to-b from-gray-100 to-gray-200 p-2 shadow-inner sm:gap-3 sm:p-4">
          {wide ? (
            <>
              <BookPrintPagePreview
                page={spread.left}
                pageNumber={spread.leftPageNumber}
                binding={binding}
                side="left"
                showGuides={showGuides}
              />
              <div className="w-px shrink-0 bg-gray-300/80" aria-hidden />
              <BookPrintPagePreview
                page={spread.right}
                pageNumber={spread.rightPageNumber}
                binding={binding}
                side="right"
                showGuides={showGuides}
              />
            </>
          ) : (
            <BookPrintPagePreview
              page={singlePage}
              pageNumber={pos + 1}
              binding={binding}
              side={pos % 2 === 0 ? "right" : "left"}
              showGuides={showGuides}
            />
          )}
        </div>

        <div className="mt-3 flex shrink-0 items-center justify-between gap-2">
          <button
            type="button"
            className="v2-btn-outline h-10 px-4"
            disabled={pos <= 0}
            onClick={() => setPos((i) => i - 1)}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Prev
          </button>
          <div className="min-w-0 text-center">
            <p className="text-xs font-semibold tabular-nums text-v2-navy">
              {wide ? `Spread ${spreadIndex + 1} of ${spreadTotal}` : `${pos + 1} / ${pages.length}`}
            </p>
          </div>
          <button
            type="button"
            className="v2-btn-outline h-10 px-4"
            disabled={pos >= stepTotal - 1}
            onClick={() => setPos((i) => i + 1)}
            aria-label="Next"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-2 shrink-0">
          <BookPrintGuidesToggle checked={showGuides} onChange={setShowGuides} printed={binding.id !== "digital"} />
        </div>

        <p className="mt-1.5 shrink-0 text-center text-[11px] leading-snug text-v2-muted">
          {BOOK_PAGE_COUNT_HINT} Page 1 prints on the right-hand side. Landscape sheets are shown
          rotated to portrait as they will print.
        </p>
      </div>
    </V2Modal>
  );
}
