"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BookCoverCredit } from "@/components/v2/book-order/BookCoverCredit";
import { BookCoverCanvas } from "@/components/v2/book-order/BookCoverCanvas";
import { BookPrintGuidesToggle } from "@/components/v2/book-order/BookPrintGuidesToggle";
import { BookPrintPagePreview } from "@/components/v2/book-order/BookPrintPagePreview";
import type { BookBindingId, BookBindingSpec } from "@/lib/print/bookBindings";
import { bookOpenSpreads, type BookCoverDesign } from "@/lib/print/bookCover";
import type { BookWizardPage } from "@/lib/print/bookWizardTypes";

type Props = {
  pages: BookWizardPage[];
  binding: BookBindingSpec;
  design: BookCoverDesign;
  coverSources: string[];
  /** Already confirmed for exactly this book (nothing changed since). */
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
};

type View =
  | { kind: "front" }
  | { kind: "back" }
  | { kind: "pages"; left: number | null; right: number | null; single?: number };

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

function InsideCover({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <p className="mb-1 text-center text-[10px] font-semibold text-v2-muted">{label}</p>
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-1.5">
        <span className="aspect-[8.5/11] text-center text-xs text-v2-muted">Not printed</span>
      </div>
    </div>
  );
}

/**
 * Step 4: the customer must turn every page, cover to cover, before they can
 * say the book is right. Shown as the book lies open — page 1 on the right.
 */
export function BookProofStep({ pages, binding, design, coverSources, confirmed, onConfirmedChange }: Props) {
  const wide = useIsWide();
  const views = useMemo<View[]>(() => {
    const inside: View[] = wide
      ? bookOpenSpreads(pages.length).map((s) => ({ kind: "pages", ...s }))
      : pages.map((_, i) => ({ kind: "pages", left: null, right: null, single: i + 1 }));
    return [{ kind: "front" }, ...inside, { kind: "back" }];
  }, [pages, wide]);

  const [rawPos, setPos] = useState(0);
  const [showGuides, setShowGuides] = useState(true);
  const pos = Math.min(rawPos, views.length - 1);
  const view = views[pos];
  // Reaching the back cover means every page has been on screen.
  const [seenAll, setSeenAll] = useState(confirmed);
  const atEnd = pos === views.length - 1;
  if (atEnd && !seenAll) setSeenAll(true);

  const go = (delta: number) => setPos(Math.max(0, Math.min(views.length - 1, pos + delta)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setPos((i) => Math.min(views.length - 1, i + 1));
      if (e.key === "ArrowLeft") setPos((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [views.length]);

  const title =
    view.kind === "front"
      ? "Front cover"
      : view.kind === "back"
        ? "Back cover"
        : view.single
          ? `Page ${view.single} of ${pages.length}`
          : view.left && view.right
            ? `Pages ${view.left}–${view.right} of ${pages.length}`
            : `Page ${view.left ?? view.right} of ${pages.length}`;

  const pageAt = (n: number) => pages[n - 1] ?? null;

  return (
    <div>
      <p className="text-center text-sm font-semibold text-v2-ink" aria-live="polite">
        {title}
      </p>
      <div className="mx-auto mt-2 flex h-[min(60dvh,36rem)] w-full max-w-3xl items-stretch justify-center gap-2 rounded-xl border border-gray-300 bg-gradient-to-b from-gray-100 to-gray-200 p-3 shadow-inner sm:gap-3 sm:p-4">
        {view.kind === "front" ? (
          <BookCoverCanvas
            design={design}
            sources={coverSources}
            bindingId={binding.id as BookBindingId}
            className="h-full max-w-full rounded-sm"
          />
        ) : view.kind === "back" ? (
          <div
            className="relative aspect-[8.5/11] h-full max-w-full overflow-hidden rounded-sm shadow-md"
            style={{ backgroundColor: design.backgroundColor }}
          >
            <BookCoverCredit backgroundColor={design.backgroundColor} />
          </div>
        ) : view.single ? (
          <BookPrintPagePreview
            page={pageAt(view.single)}
            pageNumber={view.single}
            binding={binding}
            side={view.single % 2 === 1 ? "right" : "left"}
            totalPages={pages.length} showGuides={showGuides}
            className="max-w-xs"
          />
        ) : (
          <>
            {view.left ? (
              <BookPrintPagePreview page={pageAt(view.left)} pageNumber={view.left} binding={binding} side="left" totalPages={pages.length} showGuides={showGuides} />
            ) : (
              <InsideCover label="Inside front cover" />
            )}
            <div className="w-px shrink-0 bg-gray-300/80" aria-hidden />
            {view.right ? (
              <BookPrintPagePreview page={pageAt(view.right)} pageNumber={view.right} binding={binding} side="right" totalPages={pages.length} showGuides={showGuides} />
            ) : (
              <InsideCover label="Inside back cover" />
            )}
          </>
        )}
      </div>

      <div className="mx-auto mt-4 flex max-w-3xl items-center justify-between gap-2">
        <button type="button" className="v2-btn-outline h-11 px-4" disabled={pos <= 0} onClick={() => go(-1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Prev
        </button>
        <p className="text-center text-xs tabular-nums text-v2-muted">
          {pos + 1} / {views.length}
        </p>
        <button type="button" className="v2-btn-outline h-11 px-4" disabled={atEnd} onClick={() => go(1)}>
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {view.kind === "pages" ? (
        <div className="mx-auto mt-3 max-w-3xl">
          <BookPrintGuidesToggle checked={showGuides} onChange={setShowGuides} printed />
        </div>
      ) : null}

      <div className="mx-auto mt-5 max-w-3xl rounded-xl border border-gray-200 bg-white p-4">
        <label className={seenAll ? "flex items-start gap-3 text-sm text-v2-ink" : "flex items-start gap-3 text-sm text-v2-muted"}>
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0"
            disabled={!seenAll}
            checked={confirmed}
            onChange={(e) => onConfirmedChange(e.target.checked)}
          />
          <span>
            <span className="font-semibold">I&apos;ve looked at every page and this is how I want my book printed.</span>
            <span className="mt-0.5 block text-xs text-v2-muted">
              {seenAll
                ? "Printed books are made to order and can't be changed once they go to the printer."
                : "Turn through to the back cover to continue."}
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
