"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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

export function BookFlipThroughModal({ pages, binding, onClose }: Props) {
  const spreadTotal = useMemo(() => bookSpreadCount(pages.length), [pages.length]);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const spread = getBookPageSpread(pages, spreadIndex);

  useEffect(() => {
    setSpreadIndex((i) => Math.min(i, Math.max(0, spreadTotal - 1)));
  }, [spreadTotal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setSpreadIndex((i) => Math.min(spreadTotal - 1, i + 1));
      if (e.key === "ArrowLeft") setSpreadIndex((i) => Math.max(0, i - 1));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, spreadTotal]);

  const title =
    spread.left && spread.right
      ? `Pages ${spread.rightPageNumber}–${spread.leftPageNumber} of ${pages.length}`
      : `Page ${spread.rightPageNumber} of ${pages.length}`;

  return (
    <V2Modal onClose={onClose} maxWidthClass="max-w-4xl" title={title}>
      <div className="px-4 pb-6 pt-2 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button type="button" className="v2-btn-sm v2-btn-outline" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
            Close
          </button>
          <p className="text-xs text-v2-muted">
            Spread {spreadIndex + 1} of {spreadTotal} · portrait print preview
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="v2-btn-sm v2-btn-outline"
              disabled={spreadIndex <= 0}
              onClick={() => setSpreadIndex((i) => i - 1)}
              aria-label="Previous spread"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className="v2-btn-sm v2-btn-outline"
              disabled={spreadIndex >= spreadTotal - 1}
              onClick={() => setSpreadIndex((i) => i + 1)}
              aria-label="Next spread"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="mx-auto flex max-h-[min(72dvh,40rem)] w-full items-stretch justify-center gap-2 rounded-xl border border-gray-300 bg-gradient-to-b from-gray-100 to-gray-200 p-3 shadow-inner sm:gap-3 sm:p-4">
          <BookPrintPagePreview
            page={spread.left}
            pageNumber={spread.leftPageNumber}
            binding={binding}
            side="left"
          />
          <div className="w-px shrink-0 bg-gray-300/80" aria-hidden />
          <BookPrintPagePreview
            page={spread.right}
            pageNumber={spread.rightPageNumber}
            binding={binding}
            side="right"
          />
        </div>

        <p className="mt-3 text-center text-xs leading-relaxed text-v2-muted">
          {BOOK_PAGE_COUNT_HINT} Like an open book: page 1 prints on the right. Landscape sheets
          are shown rotated to portrait as they will print.
        </p>
      </div>
    </V2Modal>
  );
}
