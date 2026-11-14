"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, Gift, Loader2, X } from "lucide-react";
import { BookCoverCanvas } from "@/components/v2/book-order/BookCoverCanvas";
import { BookCoverCredit } from "@/components/v2/book-order/BookCoverCredit";
import { BookPrintGuidesToggle } from "@/components/v2/book-order/BookPrintGuidesToggle";
import { BookPrintPagePreview } from "@/components/v2/book-order/BookPrintPagePreview";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useLayerHistory } from "@/components/v2/studio/useLayerHistory";
import { Confetti } from "@/components/v2/studio/order/Confetti";
import type { OrderRow } from "@/components/v2/studio/order/BookOrderPanel";
import { proofPageKey, type BookOrder } from "@/components/v2/studio/order/useBookOrder";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";
import { formatDeliveryRange } from "@/lib/orders/deliveryEstimate";
import type { BookBindingId } from "@/lib/print/bookBindings";
import { bookOpenSpreads } from "@/lib/print/bookCover";
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
export function ConfirmPurchaseModal({ order, initialStep, autoPlace, onClose, onFixPage, onEditRow }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wide = useWide();
  const toast = useV2Toast();
  const placed = order.placed;
  const closeIfIdle = () => {
    if (!order.placing) onClose();
  };
  useModalLayer({ panelRef, initialFocusRef: bodyRef, onClose: closeIfIdle });
  useLayerHistory(true, closeIfIdle);
  const [step, setStep] = useState<ConfirmStep>(initialStep === "overview" && order.proofConfirmed ? "overview" : "proof");
  const [showGuides, setShowGuides] = useState(false);
  const printed = !order.isDigital;

  // ---- proof items ------------------------------------------------------------------
  const allItems = useMemo<ProofItem[]>(() => {
    const pages = order.plan.allPages.map(
      (page, i): ProofItem => ({ kind: "page", key: proofPageKey(page), page, number: i + 1 }),
    );
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

  const total = order.quoteCents;
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
      : "Check and buy";
  const progress = step === "proof" ? (items.length - unseen) / Math.max(1, items.length) : 1;

  return (
    <div className="fixed inset-0 z-[55] flex items-stretch justify-center lg:items-center lg:p-6" role="dialog" aria-modal="true" aria-label="Confirm and buy">
      <button type="button" tabIndex={-1} className="absolute inset-0 hidden bg-v2-ink/40 lg:block" aria-label="Close" onClick={closeIfIdle} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="cm-sheet-up relative flex h-full w-full flex-col overflow-hidden bg-v2-surface focus:outline-none lg:h-[min(900px,calc(100dvh-3rem))] lg:max-w-5xl lg:rounded-2xl lg:border lg:border-gray-200 lg:shadow-2xl"
      >
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
            <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-v2-ink" aria-live="polite">
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
              <div className="h-full bg-v2-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
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
                    : `${unseen} more to look at`}
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
                ) : order.shortfallCents > 0 ? (
                  <button
                    type="button"
                    className="v2-btn-primary min-h-12 w-full text-base"
                    disabled={order.quoteCents == null || order.quoteLoading}
                    onClick={() => void order.startTopUp(order.shortfallCents)}
                  >
                    Add {formatCredits(order.shortfallCents)} and complete purchase
                  </button>
                ) : (
                  <button
                    type="button"
                    className="v2-btn-primary min-h-12 w-full text-base"
                    disabled={order.quoteCents == null || order.quoteLoading || !order.proofConfirmed}
                    onClick={() => void order.placeOrder()}
                  >
                    Complete purchase{order.quoteCents != null ? ` · ${formatCredits(order.quoteCents)}` : ""}
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
            <p className="v2-brand-title min-w-0 break-words text-lg text-v2-ink">“{order.coverTitle}”</p>
            {printed ? edit("cover") : null}
          </div>
          <div className="flex items-center justify-between gap-2 text-sm text-v2-muted">
            <span>
              {order.binding.shortLabel} · {order.plan.totalPages} pages
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

      <dl className="space-y-1.5 rounded-xl bg-v2-bg-subtle/70 p-3 text-sm">
        {order.isDigital ? (
          <Line label="Print-at-home PDF" cents={order.quoteCents} />
        ) : (
          <>
            <Line label="Book" cents={order.printCents} />
            <Line label="Shipping" cents={order.shippingCents} />
            <Line label="Sales tax" cents={order.taxCents} />
          </>
        )}
        <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
          <dt className="font-semibold text-v2-ink">Total</dt>
          <dd className="text-lg font-bold tabular-nums text-v2-ink">{order.quoteCents != null ? formatCredits(order.quoteCents) : "…"}</dd>
        </div>
        {creditApplied != null ? <Line label="Paid from your credit" cents={creditApplied} /> : null}
        {order.shortfallCents > 0 ? <Line label="Credit to add" cents={order.shortfallCents} /> : null}
        {balanceAfter != null ? <Line label="Credit left after" cents={balanceAfter} /> : null}
      </dl>
      {!order.isDigital && formatDeliveryRange(order.deliveryEstimate) ? (
        <p className="text-sm text-v2-ink">
          <span className="font-semibold">Estimated delivery:</span> {formatDeliveryRange(order.deliveryEstimate)}
          <span className="block text-xs text-v2-muted">The printer&apos;s estimate, not a guarantee.</span>
        </p>
      ) : null}
    </div>
  );
}

function Line({ label, cents }: { label: string; cents: number | null }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-v2-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-v2-ink">{cents != null ? formatCredits(cents) : "…"}</dd>
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
