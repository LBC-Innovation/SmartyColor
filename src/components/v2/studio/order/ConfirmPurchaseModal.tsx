"use client";

import { fasterShippingChoices, fasterShippingPrompt, scrollToShippingSpeeds, shippingLevelLabel } from "@/lib/orders/shippingLevels";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, Gift, ImagePlus, Loader2, NotebookPen, Square, X } from "lucide-react";
import { BookCoverCanvas } from "@/components/v2/book-order/BookCoverCanvas";
import { BookCoverCredit } from "@/components/v2/book-order/BookCoverCredit";
import { BookPrintGuidesToggle } from "@/components/v2/book-order/BookPrintGuidesToggle";
import { BookPrintPagePreview } from "@/components/v2/book-order/BookPrintPagePreview";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { recheckTopUp, useTopUpStatus } from "@/components/v2/credits/useCreditCheckoutReturn";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useLayerHistory } from "@/components/v2/studio/useLayerHistory";
import { Confetti } from "@/components/v2/studio/order/Confetti";
import { formatSummary, type OrderRow } from "@/components/v2/studio/order/BookOrderPanel";
import { proofPageKey, type BookOrder } from "@/components/v2/studio/order/useBookOrder";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";
import { formatDeliveryRange } from "@/lib/orders/deliveryEstimate";
import type { BookBindingId } from "@/lib/print/bookBindings";
import { bookOpenSpreads } from "@/lib/print/bookCover";
import { isBlankBack } from "@/lib/print/bookPagePlan";
import type { BookWizardPage } from "@/lib/print/bookWizardTypes";

export type ConfirmStep = "proof" | "overview";

type Props = {
  order: BookOrder;
  initialStep: ConfirmStep;
  /** Back from adding credit: place the order by itself (with a moment to cancel) once it can. */
  autoPlace: boolean;
  onClose: () => void;
  /** "Fix this page": close, and open that page in the editor. Gets the book page's photo id. */
  onFixPage: (libraryPhotoId: string) => void;
  /** An overview "Edit" link: close, and open that row of the order panel. */
  onEditRow: (row: OrderRow) => void;
  /** On a blank page: close and open the photo picker, so a new photo can take its place. */
  onAddPhoto: () => void;
};

type ProofItem =
  | { kind: "front"; key: string }
  | { kind: "back"; key: string }
  | { kind: "page"; key: string; page: BookWizardPage; number: number };

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

/** Proof, overview and thank-you in one dialog: full screen on phones, large on desktop. */
export function ConfirmPurchaseModal({ order, initialStep, autoPlace, onClose, onFixPage, onEditRow, onAddPhoto }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wide = useWide();
  const toast = useV2Toast();
  const topUp = useTopUpStatus();
  const placed = order.placed;
  const closeIfIdle = () => {
    if (order.placing) return;
    // Leaving the thank-you screen any way (Esc, Back, the backdrop) does what "Make another book"
    // does, so the ordered book doesn't linger in the panel with its cart already closed.
    if (placed) order.startOver();
    onClose();
  };
  const { zIndex: layerZ } = useModalLayer({ baseZ: 55, panelRef, initialFocusRef: bodyRef, onClose: closeIfIdle });
  useLayerHistory(true, closeIfIdle);
  const [step, setStep] = useState<ConfirmStep>(initialStep === "overview" && order.proofConfirmed ? "overview" : "proof");
  const [showGuides, setShowGuides] = useState(false);
  const printed = !order.isDigital;

  // ---- proof items ------------------------------------------------------------------
  const allItems = useMemo<ProofItem[]>(() => {
    // Blank backs are empty by design: they show in the open-book spreads but aren't pages to check one by one.
    const pages = order.plan.allPages
      .map((page, i): ProofItem => ({ kind: "page", key: proofPageKey(page), page, number: i + 1 }))
      .filter((item) => item.kind !== "page" || !isBlankBack(item.page));
    return printed ? [{ kind: "front", key: order.coverKey }, ...pages, { kind: "back", key: "back" }] : pages;
  }, [order.plan.allPages, order.coverKey, printed]);
  // Coming back after fixing a page: only what changed since the last check is shown again.
  const changedItems = useMemo(
    () =>
      order.checkedPageKeys.size > 0
        ? allItems.filter((item) => item.kind !== "back" && !order.checkedPageKeys.has(item.key))
        : null,
    [allItems, order.checkedPageKeys],
  );
  const onlyChanged = changedItems != null && changedItems.length > 0 && changedItems.length < allItems.length;
  const items = onlyChanged ? changedItems! : allItems;
  const spreadMode = wide && !onlyChanged;
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const markSeen = (keys: string[]) =>
    setSeen((prev) => (keys.every((k) => prev.has(k)) ? prev : new Set([...prev, ...keys])));

  // Desktop: covers and open-book spreads, one view at a time.
  type View = { keys: string[]; render: "front" | "back" | { left: number | null; right: number | null } };
  const views = useMemo<View[]>(() => {
    if (!spreadMode) return [];
    const pages = order.plan.allPages;
    const spreads = bookOpenSpreads(pages.length).map((s) => ({
      keys: [s.left, s.right].filter((n): n is number => n != null).map((n) => proofPageKey(pages[n - 1])),
      render: s,
    }));
    return printed
      ? [{ keys: [order.coverKey], render: "front" as const }, ...spreads, { keys: ["back"], render: "back" as const }]
      : spreads;
  }, [spreadMode, order.plan.allPages, order.coverKey, printed]);
  const [viewIndex, setViewIndexRaw] = useState(0);
  const [seenViews, setSeenViews] = useState<ReadonlySet<number>>(() => new Set([0]));
  const setViewIndex = (next: number | ((i: number) => number)) =>
    setViewIndexRaw((i) => {
      const n = typeof next === "function" ? next(i) : next;
      setSeenViews((prev) => (prev.has(n) ? prev : new Set([...prev, n])));
      return n;
    });
  const view = views[Math.min(viewIndex, Math.max(0, views.length - 1))];
  // A spread counts as seen once it has been on screen.
  const seenInSpreads = useMemo(() => {
    const keys = new Set<string>();
    views.forEach((v, i) => {
      if (seenViews.has(i)) v.keys.forEach((k) => keys.add(k));
    });
    return keys;
  }, [views, seenViews]);
  useEffect(() => {
    if (!spreadMode || step !== "proof") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setViewIndex((i) => Math.min(views.length - 1, i + 1));
      if (e.key === "ArrowLeft") setViewIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spreadMode, step, views.length]);

  // Phones (and "changed pages only"): one scroll; a page counts as seen once 60% of it is visible.
  const listRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (spreadMode || step !== "proof") return;
    const root = bodyRef.current;
    const nodes = listRef.current?.querySelectorAll<HTMLElement>("[data-proof-key]");
    if (!root || !nodes) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const keys: string[] = [];
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.6) continue;
          const el = entry.target as HTMLElement;
          keys.push(el.dataset.proofKey!);
          setCurrent(Number(el.dataset.proofIndex));
        }
        if (keys.length) markSeen(keys);
      },
      { root, threshold: [0.6] },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [spreadMode, step, items]);

  const unseen = items.filter((item) => !seen.has(item.key) && !(spreadMode && seenInSpreads.has(item.key))).length;
  const seenAll = unseen === 0;

  function confirmProof() {
    order.confirmProof();
    setStep("overview");
    bodyRef.current?.scrollTo({ top: 0 });
  }

  // ---- auto place after a top-up ------------------------------------------------------
  const [countdown, setCountdown] = useState<number | null>(null);
  const [autoArmed, setAutoArmed] = useState(autoPlace);
  const canPlace =
    order.proofConfirmed && order.quoteCents != null && !order.quoteLoading && order.shortfallCents === 0 && !order.placing && !placed;
  const quoteUnchanged = order.restoredCart?.quotedCents == null || order.restoredCart.quotedCents === order.quoteCents;
  // The book changed under the overview (a page redrawn, the cover edited): paying or placing needs a
  // fresh look, so go back to the proof, which shows just what changed.
  if (step === "overview" && !order.proofConfirmed && !placed && !order.placing && countdown == null) {
    setStep("proof");
  }
  // Once, when everything is ready after the top-up: start a short countdown (a new total waits for a tap).
  if (autoArmed && step === "overview" && canPlace) {
    setAutoArmed(false);
    if (quoteUnchanged) setCountdown(3);
  }
  const placeRef = useRef(order.placeOrder);
  useEffect(() => {
    placeRef.current = order.placeOrder;
  });
  useEffect(() => {
    if (countdown == null) return;
    const t = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        void placeRef.current();
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  // ---- thanks ---------------------------------------------------------------------------
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const [delivery, setDelivery] = useState<{ min: string | null; max: string | null } | null>(null);
  const [downloading, setDownloading] = useState(false);
  /** Saving the book before add-credit opens (a moment, on a slow connection). */
  const [startingTopUp, setStartingTopUp] = useState(false);
  useEffect(() => {
    if (!placed) return;
    headlineRef.current?.focus();
    if (placed.digital) return;
    let cancelled = false;
    void api.fetchOrder(placed.orderId, false).then((result) => {
      if (cancelled || api.isError(result)) return;
      setDelivery({ min: result.data.estimatedDeliveryMin, max: result.data.estimatedDeliveryMax });
    });
    return () => {
      cancelled = true;
    };
  }, [placed]);

  // What the wallet pays: the total less what the album's purchase code covers.
  const total = order.dueCents;
  const creditApplied = total != null && order.balanceCents != null ? Math.min(total, order.balanceCents) : null;
  const balanceAfter = total != null && order.balanceCents != null ? Math.max(0, order.balanceCents - total) : null;

  function pageView(item: ProofItem, index: number) {
    return (
      <div key={item.key} data-proof-key={item.key} data-proof-index={index} className="scroll-mt-16">
        <div className="mx-auto flex h-[min(72dvh,40rem)] max-w-md items-stretch justify-center rounded-xl bg-gradient-to-b from-gray-100 to-gray-200 p-3">
          {item.kind === "front" ? (
            <BookCoverCanvas
              design={order.coverDesign}
              sources={order.coverSources}
              bindingId={order.bindingId as BookBindingId}
              className="h-full max-w-full rounded-sm"
            />
          ) : item.kind === "back" ? (
            <div className="relative aspect-[8.5/11] h-full max-w-full overflow-hidden rounded-sm shadow-md" style={{ backgroundColor: order.coverDesign.backgroundColor }}>
              <BookCoverCredit backgroundColor={order.coverDesign.backgroundColor} />
            </div>
          ) : (
            <BookPrintPagePreview
              page={item.page}
              pageNumber={item.number}
              binding={order.binding}
              side={item.number % 2 === 1 ? "right" : "left"}
              totalPages={order.plan.allPages.length}
              showGuides={showGuides}
            />
          )}
        </div>
        <div className="mx-auto mt-1 flex max-w-md items-center justify-between gap-2 px-1">
          <p className="text-xs font-semibold text-v2-muted">
            {item.kind === "front" ? "Front cover" : item.kind === "back" ? "Back cover" : `Page ${item.number}`}
          </p>
          {item.kind === "page" && item.page.kind === "photo" ? (
            <FixButton onClick={() => onFixPage((item.page as Extract<BookWizardPage, { kind: "photo" }>).photoId)} />
          ) : item.kind === "front" ? (
            <button type="button" className="min-h-11 px-2 text-sm font-semibold text-v2-link" onClick={() => onEditRow("cover")}>
              Fix the cover
            </button>
          ) : null}
        </div>
        {item.kind === "page" && item.page.kind === "blank" ? (
          <BlankPageChoices
            className="mx-auto mt-1 max-w-md px-1"
            choice={order.blankChoices[item.page.id] ?? null}
            onAddPhoto={onAddPhoto}
            onChoose={(variant) => order.chooseBlank(item.page.id, variant)}
          />
        ) : null}
      </div>
    );
  }

  const header = placed
    ? null
    : step === "proof"
      ? spreadMode
        ? view?.render === "front"
          ? "Front cover"
          : view?.render === "back"
            ? "Back cover"
            : `Pages ${[(view?.render as { left: number | null }).left, (view?.render as { right: number | null }).right].filter(Boolean).join(" and ")} of ${order.plan.allPages.length}`
        : `${items[current]?.kind === "page" ? `Page ${(items[current] as { number: number }).number}` : items[current]?.kind === "front" ? "Front cover" : "Back cover"} · ${current + 1} of ${items.length}`
      : "Review your order";
  const progress = step === "proof" ? (items.length - unseen) / Math.max(1, items.length) : 1;

  return (
    <div className="v2-modal fixed inset-0 z-[55] flex items-stretch justify-center lg:items-center lg:p-6" style={{ zIndex: layerZ }} role="dialog" aria-modal="true" aria-label="Review and order">
      <button type="button" tabIndex={-1} className="v2-modal-backdrop absolute inset-0 hidden bg-v2-plum/50 backdrop-blur-sm lg:block" aria-label="Close" onClick={closeIfIdle} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="cm-sheet-up relative flex h-full w-full flex-col overflow-hidden bg-v2-surface focus:outline-none lg:h-[min(900px,calc(100dvh-3rem))] lg:max-w-5xl lg:rounded-[1.75rem] lg:shadow-[0_32px_80px_-16px_rgb(36_26_77/0.45)] lg:ring-1 lg:ring-v2-primary/10"
      >
        <div className="v2-modal-strip h-1.5 w-full shrink-0 lg:block" aria-hidden />
        {placed ? <Confetti /> : null}
        <header className="relative shrink-0 border-b border-gray-100 pt-[env(safe-area-inset-top)]">
          <div className="flex min-h-12 items-center gap-2 px-2">
            {!placed ? (
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-30" aria-label="Close" disabled={order.placing} onClick={closeIfIdle}>
                <X className="h-5 w-5" aria-hidden />
              </button>
            ) : (
              <span className="w-11" />
            )}
            <p className="v2-brand-title min-w-0 flex-1 truncate text-center text-lg text-v2-ink" aria-live="polite">
              {header}
            </p>
            {step === "overview" && !placed ? (
              <button type="button" className="min-h-11 px-2 text-sm font-semibold text-v2-link" disabled={order.placing} onClick={() => setStep("proof")}>
                See pages
              </button>
            ) : (
              <span className="w-11" />
            )}
          </div>
          {!placed && step === "proof" ? (
            <div className="h-1 w-full bg-gray-100" aria-hidden>
              <div className="v2-modal-strip h-full transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          ) : null}
        </header>

        <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {placed ? (
            <ThanksScreen
              order={order}
              headlineRef={headlineRef}
              delivery={delivery}
              downloading={downloading}
              onDownload={async () => {
                setDownloading(true);
                const result = await api.downloadOrderPdf(placed.orderId, placed.title);
                setDownloading(false);
                if (api.isError(result)) toast.error(`${result.error.message} You can download it from My orders.`);
              }}
              onDone={() => {
                order.startOver();
                onClose();
              }}
            />
          ) : step === "proof" ? (
            <div className="px-3 py-4 sm:px-5">
              {onlyChanged ? (
                <p className="mb-3 rounded-xl bg-v2-primary-light px-3 py-2 text-center text-sm font-semibold text-v2-navy">
                  {items.length} {items.length === 1 ? "page" : "pages"} changed. Check {items.length === 1 ? "it" : "them"}.
                </p>
              ) : (
                <p className="mb-3 text-center text-sm text-v2-muted">
                  This is how your book will print. Look through every page{printed ? ", cover to cover" : ""}.
                </p>
              )}
              {spreadMode && view ? (
                <div>
                  <div className="mx-auto flex h-[min(60dvh,36rem)] w-full max-w-4xl items-stretch justify-center gap-3 rounded-xl border border-gray-300 bg-gradient-to-b from-gray-100 to-gray-200 p-4 shadow-inner">
                    {view.render === "front" ? (
                      <BookCoverCanvas design={order.coverDesign} sources={order.coverSources} bindingId={order.bindingId as BookBindingId} className="h-full max-w-full rounded-sm" />
                    ) : view.render === "back" ? (
                      <div className="relative aspect-[8.5/11] h-full max-w-full overflow-hidden rounded-sm shadow-md" style={{ backgroundColor: order.coverDesign.backgroundColor }}>
                        <BookCoverCredit backgroundColor={order.coverDesign.backgroundColor} />
                      </div>
                    ) : (
                      <>
                        {(["left", "right"] as const).map((side) => {
                          const n = view.render !== "front" && view.render !== "back" ? view.render[side] : null;
                          const page = n ? order.plan.allPages[n - 1] : null;
                          return n && page ? (
                            <div key={side} className="flex min-w-0 flex-1 flex-col">
                              <BookPrintPagePreview page={page} pageNumber={n} binding={order.binding} side={side} totalPages={order.plan.allPages.length} showGuides={showGuides} />
                              {page.kind === "photo" ? (
                                <div className="mt-1 flex justify-center">
                                  <FixButton onClick={() => onFixPage(page.photoId)} />
                                </div>
                              ) : page.kind === "blank" && !page.back ? (
                                <BlankPageChoices
                                  className="mt-1"
                                  compact
                                  choice={order.blankChoices[page.id] ?? null}
                                  onAddPhoto={onAddPhoto}
                                  onChoose={(variant) => order.chooseBlank(page.id, variant)}
                                />
                              ) : null}
                            </div>
                          ) : (
                            <div key={side} className="flex min-w-0 flex-1 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-v2-muted">
                              {side === "left" ? "Inside front cover" : "Inside back cover"}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                  <div className="mx-auto mt-3 flex max-w-4xl items-center justify-between">
                    <button type="button" className="v2-btn-outline h-11 px-4" disabled={viewIndex <= 0} onClick={() => setViewIndex((i) => i - 1)}>
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                      Prev
                    </button>
                    {view.render === "front" ? (
                      <button type="button" className="min-h-11 px-2 text-sm font-semibold text-v2-link" onClick={() => onEditRow("cover")}>
                        Fix the cover
                      </button>
                    ) : (
                      <span className="text-xs tabular-nums text-v2-muted">
                        {viewIndex + 1} / {views.length}
                      </span>
                    )}
                    <button type="button" className="v2-btn-outline h-11 px-4" disabled={viewIndex >= views.length - 1} onClick={() => setViewIndex((i) => i + 1)}>
                      Next
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ) : (
                <div ref={listRef} className="space-y-6">
                  {items.map((item, i) => pageView(item, i))}
                </div>
              )}
              {printed ? (
                <div className="mt-4">
                  <BookPrintGuidesToggle checked={showGuides} onChange={setShowGuides} printed />
                </div>
              ) : null}
            </div>
          ) : (
            <Overview
              order={order}
              creditApplied={creditApplied}
              balanceAfter={balanceAfter}
              onEditRow={onEditRow}
            />
          )}
        </div>

        {!placed ? (
          <footer className="shrink-0 border-t border-gray-100 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {step === "proof" ? (
              <>
                <button type="button" className="v2-btn-primary min-h-12 w-full text-base" disabled={!seenAll} onClick={confirmProof}>
                  Everything looks good
                </button>
                <p className="mt-1 text-center text-xs text-v2-muted" role="status">
                  {seenAll
                    ? "Printed books are made to order and can't be changed once they go to the printer."
                    : `${unseen} more ${unseen === 1 ? "page" : "pages"} to look at`}
                </p>
              </>
            ) : (
              <>
                {order.error ? (
                  <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {order.error}
                  </p>
                ) : null}
                {countdown != null ? (
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm font-semibold text-v2-ink" role="status">
                      <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                      Placing your order…
                    </p>
                    <button type="button" className="v2-btn-outline min-h-11 px-4 text-sm" onClick={() => setCountdown(null)}>
                      Cancel
                    </button>
                  </div>
                ) : order.placing ? (
                  <button type="button" className="v2-btn-primary min-h-12 w-full text-base" disabled>
                    <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
                    Placing your order…
                  </button>
                ) : order.shortfallCents > 0 && topUp.kind === "confirming" ? (
                  // Back from Stripe, credit not on the balance yet: no second pay button meanwhile.
                  <button type="button" className="v2-btn-primary min-h-12 w-full text-base" disabled aria-busy>
                    <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
                    Confirming your payment…
                  </button>
                ) : order.shortfallCents > 0 && (topUp.kind === "slow" || topUp.kind === "bank") ? (
                  <div>
                    <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
                      {topUp.kind === "bank"
                        ? `Your ${formatCredits(topUp.amountCents)} is on its way from your bank, which can take a few days. Your book is saved; place the order once it arrives.`
                        : "We're still confirming your payment. If you were charged, it will show up in your wallet balance shortly, so please don't pay again yet."}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {topUp.kind === "slow" ? (
                        <button type="button" className="v2-btn-primary min-h-12 flex-1 text-base" onClick={recheckTopUp}>
                          Check again
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="v2-btn-outline min-h-12 flex-1 text-base"
                        disabled={startingTopUp}
                        onClick={() => {
                          setStartingTopUp(true);
                          void order.startTopUp(order.shortfallCents).finally(() => setStartingTopUp(false));
                        }}
                      >
                        {topUp.kind === "bank" ? "Pay by card instead" : "Add to wallet again"}
                      </button>
                    </div>
                  </div>
                ) : order.shortfallCents > 0 ? (
                  <button
                    type="button"
                    className="v2-btn-primary min-h-12 w-full text-base"
                    disabled={order.quoteCents == null || order.quoteLoading || startingTopUp || !order.proofConfirmed}
                    aria-busy={startingTopUp}
                    onClick={() => {
                      setStartingTopUp(true);
                      void order.startTopUp(order.shortfallCents).finally(() => setStartingTopUp(false));
                    }}
                  >
                    {startingTopUp ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                    Pay {formatCredits(order.shortfallCents)} and place order
                  </button>
                ) : (
                  <button
                    type="button"
                    className="v2-btn-primary min-h-12 w-full text-base"
                    disabled={order.quoteCents == null || order.quoteLoading || !order.proofConfirmed}
                    onClick={() => void order.placeOrder()}
                  >
                    Place order
                    {order.dueCents != null
                      ? order.purchaseCode && order.dueCents === 0
                        ? order.purchaseCode.source === "package"
                          ? " · already paid"
                          : " · nothing to pay"
                        : order.dueCents > 0
                          ? // Paid from the wallet (a card is the "Pay $X and place order" button above), so
                            // say so: the price box's "You pay" shows $0.00 for this.
                            ` · ${formatCredits(order.dueCents)}${order.purchaseCode && order.purchaseCode.source !== "package" ? " extra" : ""} from wallet balance`
                          : ` · ${formatCredits(order.dueCents)}`
                      : ""}
                  </button>
                )}
                <p className="mt-1 text-center text-xs text-v2-muted">
                  {printed ? "You'll get an email with your order." : "Your receipt is in My orders."}
                </p>
              </>
            )}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Under a page the book had to add to reach its page count: replace it with another photo, make
 * it a lined page for writing, or keep it blank. Blank is what prints if nothing is chosen.
 */
function BlankPageChoices({
  choice,
  onAddPhoto,
  onChoose,
  compact,
  className,
}: {
  choice: "plain" | "lined" | null;
  onAddPhoto: () => void;
  onChoose: (variant: "plain" | "lined") => void;
  compact?: boolean;
  className?: string;
}) {
  const chip = (selected: boolean) =>
    cn(
      "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition sm:text-sm",
      selected ? "border-v2-primary bg-v2-primary-light text-v2-navy" : "border-gray-200 bg-white text-v2-navy hover:border-v2-primary/40",
    );
  return (
    <div className={className} role="group" aria-label="This page is blank">
      {!compact ? <p className="mb-1 text-xs text-v2-muted">This page is blank so your book has the pages its binding needs.</p> : null}
      <div className={cn("grid gap-1.5", compact ? "grid-cols-1" : "grid-cols-3")}>
        <button type="button" className={chip(false)} onClick={onAddPhoto}>
          <ImagePlus className="h-4 w-4 shrink-0" aria-hidden />
          Add another photo
        </button>
        <button type="button" className={chip(choice === "lined")} aria-pressed={choice === "lined"} onClick={() => onChoose("lined")}>
          {choice === "lined" ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <NotebookPen className="h-4 w-4 shrink-0" aria-hidden />}
          Add lined page
        </button>
        <button type="button" className={chip(choice === "plain")} aria-pressed={choice === "plain"} onClick={() => onChoose("plain")}>
          {choice === "plain" ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <Square className="h-4 w-4 shrink-0" aria-hidden />}
          Keep page blank
        </button>
      </div>
    </div>
  );
}

function FixButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="min-h-11 rounded-full px-3 text-sm font-semibold text-v2-link hover:bg-v2-primary-light" onClick={onClick}>
      Fix this page
    </button>
  );
}

function Overview({
  order,
  creditApplied,
  balanceAfter,
  onEditRow,
}: {
  order: BookOrder;
  creditApplied: number | null;
  balanceAfter: number | null;
  onEditRow: (row: OrderRow) => void;
}) {
  const printed = !order.isDigital;
  const ship = order.shippingAddress;
  const edit = (row: OrderRow) => (
    <button type="button" className="min-h-11 shrink-0 px-2 text-sm font-semibold text-v2-link" onClick={() => onEditRow(row)}>
      Edit
    </button>
  );
  const fasterCount = order.isDigital ? 0 : fasterShippingChoices(order.shippingChoices, order.shippingLevel).length;
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-5">
      <div className="flex gap-4">
        {printed ? (
          <div className="w-24 shrink-0">
            <BookCoverCanvas design={order.coverDesign} sources={order.coverSources} bindingId={order.bindingId as BookBindingId} className="w-full rounded-sm" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {printed && order.coverDesign.showTitle === false ? (
              <p className="min-w-0 text-sm font-semibold text-v2-ink">{order.coverTitle} · no title on the cover</p>
            ) : (
              <p className="v2-brand-title min-w-0 break-words text-lg text-v2-ink">“{order.coverTitle}”</p>
            )}
            {printed ? edit("cover") : null}
          </div>
          <div className="flex items-center justify-between gap-2 text-sm text-v2-muted">
            <span>
              {formatSummary(order)}
            </span>
            {edit("format")}
          </div>
        </div>
      </div>

      {printed ? (
        <section className="rounded-xl border border-gray-200 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 text-sm">
              <p className="flex items-center gap-2 font-semibold text-v2-ink">
                Ship to
                {order.isGift ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-v2-primary-light px-2 py-0.5 text-xs text-v2-navy">
                    <Gift className="h-3 w-3" aria-hidden />
                    Gift
                  </span>
                ) : null}
              </p>
              <p className="mt-1 break-words text-v2-muted">
                {[ship.name, ship.street1, ship.street2, [ship.city, ship.state_code, ship.postcode].filter(Boolean).join(" "), ship.country_code]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
            {edit("ship")}
          </div>
        </section>
      ) : (
        <p className="text-sm text-v2-muted">Delivered as a download in My orders.</p>
      )}

      <section aria-labelledby="order-ledger-heading">
        <h2 id="order-ledger-heading" className="text-sm font-semibold text-v2-ink">
          Your payment
        </h2>
        <dl className="mt-2 space-y-1.5 rounded-xl bg-v2-bg-subtle px-4 py-3 text-sm text-v2-ink">
          {order.isDigital ? (
            <Line label="Print-at-home PDF" cents={order.quoteCents} />
          ) : (
            <>
              <Line label="Book" cents={order.printCents} />
              <Line label={`${shippingLevelLabel(order.shippingLevel)} shipping`} cents={order.shippingCents} />
              <Line label="Tax" cents={order.taxCents} />
            </>
          )}
          <Line label="Total" cents={order.quoteCents} className="border-t border-gray-200 pt-2 font-semibold" />
          {order.purchaseCode ? (
            <Line
              label={
                order.purchaseCode.source === "package"
                  ? order.purchaseCode.shippingPrepaidCents > 0
                    ? "Printing and shipping, already paid"
                    : "Printing, already paid"
                  : `Paid by code ${order.purchaseCode.code}`
              }
              // A package was paid for when it was bought; this row is that money, not a new charge.
              note={order.purchaseCode.source === "package" ? "When you bought your book package" : undefined}
              cents={order.coveredCents}
              negative
              className="font-medium text-v2-success-text"
            />
          ) : null}
          {creditApplied != null && creditApplied > 0 ? (
            <Line
              label={order.purchaseCode?.source === "package" ? "Today, from your wallet balance" : "From your wallet balance"}
              cents={creditApplied}
              negative
              className="font-medium text-v2-success-text"
            />
          ) : null}
          <Line
            label={order.shortfallCents > 0 ? "Due on card" : "Left to pay"}
            cents={order.dueCents == null ? null : order.shortfallCents}
            className="border-t-2 border-gray-300 pt-2 text-base font-bold"
          />
        </dl>
        {order.purchaseCode ? (
          <p className="mt-2 text-xs text-v2-muted">
            {order.purchaseCode.source === "package"
              ? order.dueCents === 0
                ? "You already paid for this book when you bought your package. Nothing more is charged, and your wallet balance isn't touched."
                : order.purchaseCode.shippingPrepaidCents > 0
                  ? `You already paid for the printing and shipping when you bought your package, so that isn't taken from your wallet balance again. Only the extras, ${order.dueCents != null ? formatCredits(order.dueCents) : "…"}, are new.`
                  : `You already paid for the printing when you bought your package, so that isn't taken from your wallet balance again. Only shipping, its tax and any extras, ${order.dueCents != null ? formatCredits(order.dueCents) : "…"}, are new.`
              : order.dueCents === 0
                ? `Your code ${order.purchaseCode.code} pays for this book: printing, standard shipping and tax. You won't be charged.`
                : `Your code ${order.purchaseCode.code} pays ${formatCredits(order.coveredCents)}. The rest is an extra cost for the options you picked beyond your code, paid from your wallet balance.`}
          </p>
        ) : null}
        {order.shortfallCents > 0 ? (
          <p className="mt-2 text-xs text-v2-muted">
            Your card pays the rest. It&apos;s added to your wallet balance, and the book is paid from it in the same step.
          </p>
        ) : balanceAfter != null && balanceAfter > 0 && creditApplied != null && creditApplied > 0 ? (
          <p className="mt-2 text-xs text-v2-muted">Your remaining wallet balance after this: {formatCredits(balanceAfter)}</p>
        ) : null}
      </section>
      {!order.isDigital && formatDeliveryRange(order.deliveryEstimate) ? (
        <p className="text-sm text-v2-ink">
          <span className="font-semibold">Estimated delivery:</span> {formatDeliveryRange(order.deliveryEstimate)}
          {fasterCount > 0 ? (
            <>
              {" "}
              (
              <button
                type="button"
                className="font-semibold text-v2-link underline underline-offset-2 hover:no-underline"
                onClick={() => {
                  onEditRow("ship");
                  // The dialog closes and, on phones, the order sheet slides up first.
                  scrollToShippingSpeeds(350);
                }}
              >
                {fasterShippingPrompt(fasterCount)}
              </button>
              )
            </>
          ) : null}
          <span className="block text-xs text-v2-muted">The printer&apos;s estimate, not a guarantee.</span>
        </p>
      ) : null}
    </div>
  );
}

/** One ledger row, styled like the package pay screen's ledger. */
function Line({
  label,
  note,
  cents,
  negative,
  className,
}: {
  label: string;
  /** A small line under the label, such as when a prepaid amount was paid. */
  note?: string;
  cents: number | null;
  negative?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <dt>
        {label}
        {note ? <span className="block text-xs font-normal text-v2-muted">{note}</span> : null}
      </dt>
      <dd className="shrink-0 tabular-nums">{cents != null ? `${negative ? "−" : ""}${formatCredits(cents)}` : "…"}</dd>
    </div>
  );
}

function ThanksScreen({
  order,
  headlineRef,
  delivery,
  downloading,
  onDownload,
  onDone,
}: {
  order: BookOrder;
  headlineRef: React.RefObject<HTMLHeadingElement | null>;
  delivery: { min: string | null; max: string | null } | null;
  downloading: boolean;
  onDownload: () => void;
  onDone: () => void;
}) {
  const placed = order.placed!;
  const toast = useV2Toast();
  const shortId = placed.orderId.slice(0, 8).toUpperCase();
  // The dates saved on the order, else the ones the customer was just shown with the price.
  const range = formatDeliveryRange(delivery) || formatDeliveryRange(order.deliveryEstimate);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-10 text-center" role="status">
      <CheckCircle2 className="cm-fade-in h-14 w-14 text-emerald-600" aria-hidden />
      <h2 ref={headlineRef} tabIndex={-1} className="v2-brand-title mt-3 text-3xl text-v2-ink focus:outline-none">
        Thanks for ordering!
      </h2>
      <div className="mt-4 flex items-center gap-2 text-sm text-v2-ink">
        <span>
          Order <span className="font-semibold tabular-nums">{shortId}</span>
        </span>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle"
          aria-label="Copy order number"
          onClick={() => {
            void navigator.clipboard?.writeText(shortId).then(
              () => toast.success({ title: "Copied", message: `Order ${shortId}` }),
              () => undefined,
            );
          }}
        >
          <Copy className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {placed.digital ? (
        <>
          <button type="button" className="v2-btn-primary mt-5 min-h-12 w-full text-base" disabled={downloading} onClick={onDownload}>
            {downloading ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Download className="h-5 w-5" aria-hidden />}
            Download your book
          </button>
          <p className="mt-3 text-sm text-v2-muted">Your receipt is in My orders, and you can download the book again there.</p>
        </>
      ) : (
        <div className="mt-4 space-y-2 text-sm text-v2-muted">
          <p>
            <span className="font-semibold text-v2-ink">Estimated delivery: </span>
            {range || "We'll email you a delivery date once the printer schedules your book."}
          </p>
          <p>Tracking appears in My orders and in your email once it ships.</p>
          <p>{placed.email ? `We've emailed your receipt to ${placed.email}.` : "Your receipt is in My orders."}</p>
        </div>
      )}
      <div className={cn("mt-6 flex w-full flex-col gap-2")}>
        <Link href={`/orders/${placed.orderId}`} className={placed.digital ? "v2-btn-outline min-h-11 w-full" : "v2-btn-primary min-h-11 w-full"}>
          See my order
        </Link>
        <button type="button" className="v2-btn-outline min-h-11 w-full" onClick={onDone}>
          Make another book
        </button>
      </div>
    </div>
  );
}
