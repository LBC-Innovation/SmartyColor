"use client";

import { fasterShippingChoices, fasterShippingPrompt, scrollToShippingSpeeds, shippingLevelLabel } from "@/lib/orders/shippingLevels";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { AlertCircle, BookOpen, Check, ChevronDown, Gift, ImageOff, LayoutGrid, Loader2, Palette, Truck } from "lucide-react";
import { BookBindingPicker } from "@/components/v2/book-order/BookBindingPicker";
import { BookCoverCanvas } from "@/components/v2/book-order/BookCoverCanvas";
import { BookCoverDesigner } from "@/components/v2/book-order/BookCoverDesigner";
import { BookPageFitPicker } from "@/components/v2/book-order/BookPageFitPicker";
import { BookPrintQualityNotice } from "@/components/v2/book-order/BookPrintQualityNotice";
import { BookShippingAddressForm } from "@/components/v2/book-order/BookShippingAddressForm";
import { BookAddressSuggestion } from "@/components/v2/book-order/BookAddressSuggestion";
import { hasOriginalPhotos } from "@/components/v2/book-order/useCoverSources";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { isAutomaticAlbumName } from "@/components/v2/studio/albumNames";
import type { BookOrder } from "@/components/v2/studio/order/useBookOrder";
import { GIFT_NOTE_PLACEHOLDER, GUEST_GATES, HOLIDAY_LINE, PRICE_LINE } from "@/content/marketing";
import { withNextParam } from "@/lib/auth/nextPath";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";
import { formatDeliveryRange } from "@/lib/orders/deliveryEstimate";
import { fillCopy, numberValues } from "@/lib/marketing/copy";
import { holidayOrderBy } from "@/lib/marketing/holiday";
import { requestMigrationAfterSignup } from "@/lib/marketing/savePrompt";
import { useMarketingNumbers } from "@/lib/marketing/useMarketingNumbers";
import { GIFT_NOTE_MAX_CHARS } from "@/lib/orders/giftNote";
import { getBookFormat, isDigitalFormat, type BookBindingId, type BookFormatId } from "@/lib/print/bookBindings";
import { bookFormatFit } from "@/lib/print/bookPagePlan";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import type { PageFit } from "@/lib/print/pageLayout";
import { STUDIO_PATH } from "@/lib/v2/guestSession";

export type OrderRow = "format" | "pages" | "cover" | "ship";

type Props = {
  order: BookOrder;
  /** Photos in the album with no page yet, or whose page failed. */
  withoutPage: number;
  leftOut: number;
  openRow: OrderRow | null;
  onOpenRow: (row: OrderRow | null) => void;
  /** Close the sheet (phones) and bring the gallery into view. */
  onShowGallery: () => void;
  /** The book was thrown away: close it. */
  onDiscarded?: () => void;
};

function StatusMark({ state }: { state: "done" | "warn" | "todo" }) {
  if (state === "done") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Check className="h-4 w-4" aria-hidden />
        <span className="sr-only">Done</span>
      </span>
    );
  }
  if (state === "warn") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
        <AlertCircle className="h-4 w-4" aria-hidden />
        <span className="sr-only">Needs a look</span>
      </span>
    );
  }
  return <span className="h-6 w-6 shrink-0 rounded-full border-2 border-gray-300" aria-hidden />;
}

function Row({
  id,
  number,
  label,
  summary,
  state,
  open,
  onToggle,
  disabled,
  children,
}: {
  id: string;
  number: number;
  label: string;
  summary: ReactNode;
  state: "done" | "warn" | "todo";
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const regionId = `${id}-region`;
  return (
    <section id={id} className="scroll-mt-3 border-b border-gray-100 last:border-b-0">
      <h3>
        <button
          type="button"
          className="flex min-h-14 w-full items-center gap-3 py-2 text-left disabled:opacity-50"
          aria-expanded={open}
          aria-controls={regionId}
          disabled={disabled}
          onClick={onToggle}
        >
          <span className="w-4 shrink-0 text-xs font-bold tabular-nums text-v2-muted">{number}</span>
          <span className="w-16 shrink-0 text-sm font-semibold text-v2-ink">{label}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-v2-muted">{summary}</span>
          <StatusMark state={state} />
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-v2-muted transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </h3>
      <div id={regionId} role="region" aria-label={label} hidden={!open} className="pb-4">
        {open ? children : null}
      </div>
    </section>
  );
}

function Money({ label, cents, loading }: { label: string; cents: number | null; loading: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-v2-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-v2-ink">{loading ? "…" : cents != null ? formatCredits(cents) : "Pending"}</dd>
    </div>
  );
}

type StepState = "done" | "warn" | "todo";

/** The book's steps and how far each one is: the panel's progress bar and the gallery's book card. */
export function bookSteps(order: BookOrder): { row: OrderRow; label: string; state: StepState }[] {
  const fits = order.formatFits && !order.overCapacity;
  const shortBy = Math.max(0, order.binding.minPages - order.contentCount);
  const printed = !order.isDigital;
  const format: StepState = !order.formatChosen ? "todo" : order.contentCount > 0 && fits ? "done" : "warn";
  const pages: StepState = !order.formatChosen || !order.pageFitChosen
    ? "todo"
    : order.contentCount === 0 || order.overCapacity || order.pagesStillDrawing > 0 || (printed && shortBy > 0)
      ? "warn"
      : "done";
  const steps: { row: OrderRow; label: string; state: StepState }[] = [
    { row: "format", label: "Format", state: format },
    { row: "pages", label: "Pages", state: pages },
  ];
  // A guest sees the first two; the cover and address come after the free account.
  if (printed && order.signedIn) {
    const cover: StepState =
      !order.formatChosen || !order.coverReady ? "todo" : isAutomaticAlbumName(order.coverDesign.text ?? "") ? "warn" : "done";
    steps.push({ row: "cover", label: "Cover", state: cover });
    const ship: StepState = order.formatChosen && order.addressesReady && order.shippingChosen ? "done" : "todo";
    steps.push({ row: "ship", label: "Ship to", state: ship });
  }
  return steps;
}

/** Why "Review and order" can't be pressed yet, or null when it can. */
export function confirmBlocker(order: BookOrder): string | null {
  if (!order.signedIn) return "Create a free account to finish your book.";
  if (order.contentCount === 0) return "Make at least one coloring page first.";
  if (!order.formatChosen) return "Choose a book format.";
  if (!order.pageFitChosen) return "Choose how pictures sit on the page.";
  if (!order.isDigital && !order.coverReady) return "Choose a title and picture for your cover.";
  if (order.pagesStillDrawing > 0)
    return `${order.pagesStillDrawing} ${order.pagesStillDrawing === 1 ? "page is" : "pages are"} still being made.`;
  if (order.overCapacity) return `${order.binding.shortLabel} holds up to ${order.binding.maxPages} pages.`;
  if (!order.isDigital && !order.addressesReady) return "Add a shipping address.";
  if (!order.isDigital && !order.shippingChosen && !order.quoteLoading) return "Choose a shipping speed.";
  if (order.quoteLoading) return "Getting the price…";
  if (order.quoteCents == null) return order.quoteError ?? "Waiting for the price.";
  return null;
}

/**
 * "Your book": format, pages, cover and address as rows that open one at a time, with the total
 * and "Review and order" under them. The same rows in the desktop column and the phone sheet.
 */
export function BookOrderPanel({ order, withoutPage, leftOut, openRow, onOpenRow, onShowGallery, onDiscarded }: Props) {
  const idBase = useId();
  const numbers = useMarketingNumbers(!order.signedIn);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const holiday = holidayOrderBy();
  const holidayLine = holiday ? fillCopy(HOLIDAY_LINE, { date: holiday.label }) : null;
  const examplePrice = !order.signedIn && numbers ? fillCopy(PRICE_LINE, numberValues(numbers)) : null;
  const printed = !order.isDigital;
  const fit = { fits: order.formatFits, tooMany: order.overCapacity };
  const shortBy = Math.max(0, order.binding.minPages - order.contentCount);

  function toggle(row: OrderRow) {
    onOpenRow(openRow === row ? null : row);
  }

  /** Bring a part of the panel into view once React has drawn the row that just opened. */
  function scrollToAnchor(anchorId: string) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = document.getElementById(anchorId);
        if (!target) return;
        // Scroll only the card or sheet the panel sits in, never the page behind it.
        let box = target.parentElement;
        while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
        if (!box) return;
        const top = target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12;
        box.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
      }),
    );
  }

  /**
   * A format was picked (by click or Enter, not by arrowing through the group): open the next
   * step that needs the customer and scroll to it. Pages only when they need a look for this
   * format; otherwise straight on to the cover (printed), or the total (PDF, or a guest's
   * account card).
   */
  function pickFormat(id: BookFormatId, via: "click" | "arrow") {
    order.chooseFormat(id);
    if (via !== "click") return;
    const spec = getBookFormat(id);
    const digital = isDigitalFormat(id);
    const fitsNext = bookFormatFit(order.contentCount, spec).fits;
    const pagesNeedLook =
      !order.pageFitChosen ||
      !fitsNext ||
      order.contentCount > spec.maxPages ||
      order.pagesStillDrawing > 0 ||
      (!digital && order.contentCount < spec.minPages);
    if (pagesNeedLook) {
      onOpenRow("pages");
      scrollToAnchor(`${idBase}-pages`);
    } else {
      advancePastPages(digital);
    }
  }

  /** After the Pages step: the cover for a printed book (signed in), otherwise the total. */
  function advancePastPages(digital: boolean) {
    if (!digital && order.signedIn) {
      onOpenRow("cover");
      scrollToAnchor(`${idBase}-cover`);
    } else {
      onOpenRow(null);
      scrollToAnchor(`${idBase}-next`);
    }
  }

  /** Framed or edge to edge was picked: on to the next step, like the format. */
  function pickPageFit(fit: PageFit) {
    order.choosePageFit(fit);
    advancePastPages(order.isDigital);
  }

  if (order.contentCount === 0 && order.pagesStillDrawing === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <BookOpen className="h-8 w-8 text-v2-primary" aria-hidden />
        <p className="text-sm font-semibold text-v2-ink">Your book appears here.</p>
        <p className="text-sm text-v2-muted">Add photos to start.</p>
      </div>
    );
  }

  const coverTitleIsAutomatic = isAutomaticAlbumName(order.coverDesign.text ?? "");
  const pictureIndex =
    order.coverDesign.layout === "photo"
      ? Math.max(1, order.coverPictures.findIndex((p) => p.pageId === order.coverDesign.coverPageId) + 1)
      : null;
  const coverSummary = !order.coverReady
    ? !order.coverChoices.title
      ? "Choose a title"
      : "Choose a picture"
    : `“${order.coverTitle}” · ${
        order.coverDesign.layout === "none" ? "no picture" : pictureIndex ? `picture ${pictureIndex}` : "all pictures"
      }`;
  const shipSummary = order.addressComplete
    ? [order.shippingAddress.name, order.shippingAddress.street1, order.shippingAddress.city].filter(Boolean).join(", ")
    : "Add an address";
  const steps = bookSteps(order).map((step) => ({ ...step, anchor: `${idBase}-${step.row}` }));
  const stateOf = (row: OrderRow): StepState => steps.find((step) => step.row === row)?.state ?? "todo";

  const coverChoices = order.coverPictures.slice(0, 6);
  const fasterCount = fasterShippingChoices(order.shippingChoices, order.shippingLevel).length;
  /** One of their own pages, shown both ways in the fit picker. */
  const fitSample = order.plan.allPages.find((p): p is BookWizardPhotoPage => p.kind === "photo") ?? null;

  return (
    <div>
      {order.error ? (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {order.error}
        </p>
      ) : null}

      {!order.signedIn ? (
        <div className="mb-3 rounded-2xl border border-v2-primary/25 bg-v2-primary-light/60 p-4 text-center">
          <p className="text-sm font-semibold text-v2-ink">Create a free account to order your book. Your pages come with you.</p>
          <Link
            href={withNextParam("/sign-up", `${STUDIO_PATH}?book=open`)}
            onClick={requestMigrationAfterSignup}
            className="v2-btn-primary mt-3 min-h-11 w-full text-sm"
          >
            {GUEST_GATES.book.primary}
          </Link>
          <Link
            href={withNextParam("/sign-in", `${STUDIO_PATH}?book=open`)}
            onClick={requestMigrationAfterSignup}
            className="mt-1 inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-v2-link underline-offset-2 hover:underline"
          >
            {GUEST_GATES.book.secondary}
          </Link>
        </div>
      ) : null}

      <ol className="mb-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Steps">
        {steps.map((step, i) => {
          const active = openRow === step.row;
          const locked = step.row !== "format" && !order.formatChosen;
          return (
            <li key={step.row}>
              <button
                type="button"
                disabled={locked}
                aria-current={active ? "step" : undefined}
                className="group flex w-full flex-col gap-1.5 pb-1 pt-0.5 text-left disabled:cursor-default"
                onClick={() => {
                  onOpenRow(step.row);
                  scrollToAnchor(step.anchor);
                }}
              >
                <span
                  className={cn(
                    "h-1.5 w-full rounded-full transition-colors",
                    step.state === "done" ? "bg-emerald-500" : step.state === "warn" ? "bg-amber-400" : active ? "bg-v2-primary" : "bg-gray-200",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "truncate text-[11px] font-semibold",
                    active ? "text-v2-ink" : locked ? "text-gray-400" : "text-v2-muted group-hover:text-v2-ink",
                  )}
                >
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.label}
                  <span className="sr-only">{step.state === "done" ? ", done" : step.state === "warn" ? ", needs a look" : ""}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <Row
        id={`${idBase}-format`}
        number={1}
        label="Format"
        summary={order.formatChosen ? `${order.binding.shortLabel} · ${order.plan.totalPages} pages` : "Choose a format"}
        state={stateOf("format")}
        open={openRow === "format"}
        onToggle={() => toggle("format")}
      >
        <BookBindingPicker
          layout="list"
          value={order.formatChosen ? order.bindingId : null}
          prices={order.formatPrices}
          contentPageCount={order.contentCount}
          recommendedId={order.recommendedFormat}
          digitalPriceCents={order.digitalCents}
          onChange={pickFormat}
        />
        {examplePrice ? <p className="mt-3 text-xs text-v2-muted">{examplePrice}</p> : null}
      </Row>

      <Row
        id={`${idBase}-pages`}
        number={2}
        label="Pages"
        summary={`${order.contentCount} ${order.contentCount === 1 ? "page" : "pages"} · ${
          !order.pageFitChosen ? "choose a fit" : order.pageFit === "full" ? "edge to edge" : "framed"
        }`}
        state={stateOf("pages")}
        open={order.formatChosen && openRow === "pages"}
        onToggle={() => toggle("pages")}
        disabled={!order.formatChosen}
      >
        <div className="space-y-2 text-sm text-v2-ink">
          {fitSample ? (
            <div className="mb-3">
              <BookPageFitPicker
                value={order.pageFitChosen ? order.pageFit : null}
                onChange={pickPageFit}
                sample={fitSample}
                binding={order.binding}
              />
            </div>
          ) : null}
          <p>
            {order.contentCount} coloring {order.contentCount === 1 ? "page" : "pages"} in the same order as your album
            {order.giftNotePage ? ", plus your gift note on page 1" : ""}.
          </p>
          {fit.tooMany ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900" role="alert">
              {order.binding.shortLabel} holds {order.binding.maxPages} pages, you have {order.contentCount}: leave{" "}
              {order.contentCount - order.binding.maxPages} out or choose another format.
            </p>
          ) : shortBy > 0 && printed ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              Add {shortBy} more {shortBy === 1 ? "page" : "pages"} for {order.binding.shortLabel}, or{" "}
              {order.plan.paddingCount} {order.plan.paddingCount === 1 ? "page stays" : "pages stay"} blank.
            </p>
          ) : order.plan.paddingCount > 0 && printed ? (
            <p className="text-amber-800">
              Add {order.plan.paddingCount} more {order.plan.paddingCount === 1 ? "photo" : "photos"} to fill your book, or{" "}
              {order.plan.paddingCount} {order.plan.paddingCount === 1 ? "page stays" : "pages stay"} blank.
            </p>
          ) : null}
          {order.pagesStillDrawing > 0 ? (
            <p className="flex items-center gap-2 text-v2-muted">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              {order.pagesStillDrawing} {order.pagesStillDrawing === 1 ? "page is" : "pages are"} still being made: they&apos;ll be
              added when ready.
            </p>
          ) : null}
          {withoutPage > 0 ? (
            <p className="text-v2-muted">
              {withoutPage} {withoutPage === 1 ? "photo has" : "photos have"} no page yet and {withoutPage === 1 ? "isn't" : "aren't"} in the book.
            </p>
          ) : null}
          {leftOut > 0 ? (
            <p className="text-v2-muted">
              {leftOut} {leftOut === 1 ? "page is" : "pages are"} left out of the book.
            </p>
          ) : null}
          <BookPrintQualityNotice pageNumbers={order.softPrintPages} fit="framed" />
          <button type="button" className="min-h-11 font-semibold text-v2-link underline-offset-2 hover:underline" onClick={onShowGallery}>
            Change the order in your album
          </button>
        </div>
      </Row>

      {printed && order.signedIn ? (
        <>
          <Row
            id={`${idBase}-cover`}
            number={3}
            label="Cover"
            summary={order.coverReady && coverTitleIsAutomatic ? "Check your cover title" : coverSummary}
            state={stateOf("cover")}
            open={order.formatChosen && openRow === "cover"}
            onToggle={() => toggle("cover")}
            disabled={!order.formatChosen}
          >
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-v2-ink" htmlFor={`${idBase}-title`}>
                Title
              </label>
              <input
                id={`${idBase}-title`}
                className="v2-input w-full"
                value={order.coverChoices.title ? order.coverDesign.text : ""}
                placeholder="Type a title for the front"
                maxLength={120}
                onChange={(e) => order.chooseCover({ ...order.coverDesign, text: e.target.value }, { title: true })}
              />
              {!order.coverChoices.title && order.coverDesign.text.trim() ? (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-full border border-v2-primary/30 bg-v2-primary-light/60 px-3 text-sm font-semibold text-v2-navy hover:border-v2-primary"
                  onClick={() => order.chooseCover(order.coverDesign, { title: true })}
                >
                  Use “{order.coverDesign.text}”
                </button>
              ) : null}
              {order.coverChoices.title && coverTitleIsAutomatic ? (
                <p className="text-xs text-amber-800">Check your cover title. It still has the album&apos;s automatic name.</p>
              ) : null}
              <div className="flex gap-3">
                <div className="w-28 shrink-0">
                  <BookCoverCanvas
                    design={order.coverDesign}
                    sources={order.coverSources}
                    bindingId={order.bindingId as BookBindingId}
                    loading={order.coverPicturesLoading}
                    className="w-full rounded-sm"
                  />
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-4 gap-1.5 self-start" role="radiogroup" aria-label="Cover picture">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={order.coverChoices.layout && order.coverDesign.layout === "grid"}
                    aria-label="All pictures"
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg border-2 bg-white text-v2-muted",
                      order.coverChoices.layout && order.coverDesign.layout === "grid" ? "border-v2-primary" : "border-gray-200",
                    )}
                    onClick={() => order.chooseCover({ ...order.coverDesign, layout: "grid" }, { layout: true })}
                  >
                    <LayoutGrid className="h-5 w-5" aria-hidden />
                  </button>
                  {coverChoices.map((picture, i) => {
                    const on = order.coverChoices.layout && order.coverDesign.layout === "photo" && (order.coverDesign.coverPageId ?? coverChoices[0]?.pageId) === picture.pageId;
                    return (
                      <button
                        key={picture.pageId}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`Picture ${i + 1}`}
                        className={cn("relative aspect-square overflow-hidden rounded-lg border-2", on ? "border-v2-primary" : "border-gray-200")}
                        onClick={() => order.chooseCover({ ...order.coverDesign, layout: "photo", coverPageId: picture.pageId }, { layout: true })}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={picture.src} alt="" className="h-full w-full object-cover" />
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={order.coverChoices.layout && order.coverDesign.layout === "none"}
                    aria-label="No picture"
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg border-2 bg-white text-v2-muted",
                      order.coverChoices.layout && order.coverDesign.layout === "none" ? "border-v2-primary" : "border-gray-200",
                    )}
                    onClick={() => order.chooseCover({ ...order.coverDesign, layout: "none" }, { layout: true })}
                  >
                    <ImageOff className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </div>
              <button type="button" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-v2-link" onClick={() => setDesignerOpen(true)}>
                <Palette className="h-4 w-4" aria-hidden />
                More cover options
              </button>
            </div>
          </Row>

          <Row
            id={`${idBase}-ship`}
            number={4}
            label="Ship to"
            summary={shipSummary}
            state={stateOf("ship")}
            open={order.formatChosen && openRow === "ship"}
            onToggle={() => toggle("ship")}
            disabled={!order.formatChosen}
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-v2-bg-subtle/60 p-3">
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-v2-navy">
                  <input type="checkbox" className="h-5 w-5" checked={order.isGift} onChange={(e) => order.setGift(e.target.checked)} />
                  <Gift className="h-4 w-4 text-v2-primary" aria-hidden />
                  This is a gift
                </label>
                {order.isGift ? (
                  <div className="mt-2">
                    <label htmlFor={`${idBase}-gift`} className="text-sm font-semibold text-v2-ink">
                      Gift note <span className="font-normal text-v2-muted">(optional)</span>
                    </label>
                    <textarea
                      id={`${idBase}-gift`}
                      className="v2-input mt-1 min-h-24 w-full resize-y"
                      maxLength={GIFT_NOTE_MAX_CHARS}
                      value={order.giftNote}
                      disabled={!order.giftNoteFits && !order.giftNote}
                      onChange={(e) => order.setGiftNote(e.target.value)}
                      placeholder={holiday ? GIFT_NOTE_PLACEHOLDER.christmas : GIFT_NOTE_PLACEHOLDER.neutral}
                    />
                    <p className="mt-1 text-xs text-v2-muted">
                      {order.giftNoteFits
                        ? "Your note prints on the book's first page, so it adds a page to the book and its price."
                        : `This book is already at its ${order.binding.maxPages}-page limit, so there's no room for a note page.`}
                    </p>
                  </div>
                ) : null}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-v2-ink">{order.shipDifferent ? "Billing address" : "Your address"}</h4>
                <p className="text-xs text-v2-muted">
                  {order.shipDifferent ? "The address for your account and receipt." : "Your billing address, and where the printer mails your book."}
                </p>
                <BookShippingAddressForm
                  className="mt-3"
                  value={order.address}
                  onChange={order.updateAddress}
                  errors={order.addressErrors}
                  section={order.shipDifferent ? "billing" : "shipping"}
                  hideContact={order.shipDifferent}
                />
                {order.visibleSuggestion && !order.shipDifferent ? (
                  <BookAddressSuggestion
                    className="mt-3"
                    entered={order.address}
                    suggestion={order.visibleSuggestion}
                    onUse={() => order.answerSuggestion(true)}
                    onKeep={() => order.answerSuggestion(false)}
                  />
                ) : null}
                <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-v2-navy">
                  <input type="checkbox" className="h-5 w-5" checked={order.rememberAddress} onChange={(e) => order.setRememberAddress(e.target.checked)} />
                  Save this address for future orders
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-v2-navy">
                  <input type="checkbox" className="h-5 w-5" checked={order.shipDifferent} onChange={(e) => order.setShipElsewhere(e.target.checked)} />
                  Ship to a different address
                </label>
              </div>

              {order.shipDifferent ? (
                <div>
                  <h4 className="text-sm font-semibold text-v2-ink">Ship to</h4>
                  <p className="text-xs text-v2-muted">Where the printer should mail your book.</p>
                  <BookShippingAddressForm
                    className="mt-3"
                    idPrefix="ship-to"
                    value={order.shipTo}
                    onChange={order.updateShipTo}
                    errors={order.shipToErrors}
                  />
                  {order.visibleSuggestion ? (
                    <BookAddressSuggestion
                      className="mt-3"
                      entered={order.shipTo}
                      suggestion={order.visibleSuggestion}
                      onUse={() => order.answerSuggestion(true)}
                      onKeep={() => order.answerSuggestion(false)}
                    />
                  ) : null}
                </div>
              ) : null}
              <ShippingSpeedPicker order={order} />
            </div>
          </Row>
        </>
      ) : null}

      {!printed && order.signedIn ? (
        <p className="border-b border-gray-100 py-3 text-sm text-v2-muted">Delivered as a download in My orders.</p>
      ) : null}

      <div id={`${idBase}-next`} className="scroll-mt-3" aria-hidden />
      {order.signedIn ? (
        <div className="mt-4 rounded-2xl bg-v2-bg-subtle/70 p-4">
          {order.formatChosen ? (
            <dl className="space-y-1.5 text-sm">
              {order.isDigital ? (
                <Money label="Print-at-home PDF" cents={order.quoteCents} loading={order.quoteLoading} />
              ) : (
                <>
                  <Money label="Book" cents={order.printCents} loading={order.quoteLoading} />
                  {order.shippingChosen ? (
                    <Money label={`Shipping · ${shippingLevelLabel(order.shippingLevel)}`} cents={order.shippingCents} loading={order.quoteLoading} />
                  ) : (
                    <div className="flex items-baseline justify-between">
                      <dt className="text-v2-muted">Shipping</dt>
                      <dd className="text-v2-muted">Choose a speed</dd>
                    </div>
                  )}
                  <Money label="Sales tax" cents={order.taxCents} loading={order.quoteLoading} />
                </>
              )}
              <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
                <dt className="font-semibold text-v2-ink">Total</dt>
                <dd className="text-lg font-bold tabular-nums text-v2-ink">
                  {order.quoteLoading
                    ? "…"
                    : !order.isDigital && !order.shippingChosen
                      ? "After shipping"
                      : order.quoteCents != null
                        ? formatCredits(order.quoteCents)
                        : "Pending"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-v2-muted">Choose a format to see your price.</p>
          )}
          {!order.isDigital && order.shippingChosen && order.deliveryEstimate && formatDeliveryRange(order.deliveryEstimate) ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-v2-ink">
              <Truck className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
              <span>
                <span className="font-semibold">Estimated delivery:</span> {formatDeliveryRange(order.deliveryEstimate)}
                {fasterCount > 0 ? (
                  <>
                    {" "}
                    (
                    <button
                      type="button"
                      className="font-semibold text-v2-link underline underline-offset-2 hover:no-underline"
                      onClick={() => {
                                            onOpenRow("ship");
                        scrollToShippingSpeeds();
                      }}
                    >
                      {fasterShippingPrompt(fasterCount)}
                    </button>
                    )
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
          {!order.isDigital && !order.addressComplete ? (
            <p className="mt-1 text-xs text-v2-muted">
              Shipping, tax and delivery dates are estimated until the address is complete.
            </p>
          ) : !order.isDigital && order.deliveryEstimate ? (
            <p className="mt-1 text-xs text-v2-muted">Delivery dates are the printer&apos;s estimate, not a guarantee.</p>
          ) : null}
          {order.quoteError ? <p className="mt-1 text-xs text-amber-800">{order.quoteError}</p> : null}
          {order.balanceCents != null && order.balanceCents > 0 && order.shortfallCents > 0 ? (
            <p className="mt-2 text-xs text-v2-muted">
              Your credit covers <span className="font-semibold text-v2-ink tabular-nums">{formatCredits(order.balanceCents)}</span>.
              You pay <span className="font-semibold text-v2-ink tabular-nums">{formatCredits(order.shortfallCents)}</span>.
            </p>
          ) : order.balanceCents != null && order.shortfallCents <= 0 && order.formatChosen ? (
            <p className="mt-2 text-xs text-v2-muted">
              Paid from your credit. You have{" "}
              <span className="font-semibold text-v2-ink tabular-nums">{formatCredits(order.balanceCents)}</span>.
            </p>
          ) : null}
          {printed && holidayLine ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-v2-navy">
              <Gift className="h-3.5 w-3.5 shrink-0 text-v2-primary" aria-hidden />
              {holidayLine}
            </p>
          ) : null}
        </div>
      ) : null}

      {order.cartId ? (
        <div className="mt-4 text-center text-xs text-v2-muted">
          {confirmDiscard ? (
            <p className="flex flex-wrap items-center justify-center gap-x-2">
              <span>Discard this book? Your pages stay in the album.</span>
              <button
                type="button"
                className="min-h-11 font-semibold text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
                disabled={discarding}
                onClick={() => {
                  setDiscarding(true);
                  void order.discard().finally(() => {
                    setDiscarding(false);
                    setConfirmDiscard(false);
                    onDiscarded?.();
                  });
                }}
              >
                {discarding ? "Discarding…" : "Discard"}
              </button>
              <button type="button" className="min-h-11 font-semibold text-v2-link" onClick={() => setConfirmDiscard(false)}>
                Keep it
              </button>
            </p>
          ) : (
            <>
              Saved to your cart as you go.{" "}
              <button
                type="button"
                className="min-h-11 font-semibold text-v2-muted underline underline-offset-2 hover:text-v2-ink"
                onClick={() => setConfirmDiscard(true)}
              >
                Discard this book
              </button>
            </>
          )}
        </div>
      ) : null}

      {designerOpen ? (
        <V2Modal title={<span className="text-base font-semibold text-v2-ink">Cover</span>} onClose={() => setDesignerOpen(false)} maxWidthClass="max-w-3xl">
          <div className="p-4 sm:p-6">
            <BookCoverDesigner
              design={order.coverDesign}
              onChange={(next) =>
                order.chooseCover(next, { layout: true, title: next.text !== order.coverDesign.text || order.coverChoices.title })
              }
              binding={order.binding}
              pictures={order.coverPictures}
              picturesLoading={order.coverPicturesLoading}
              canUseOriginals={hasOriginalPhotos(order.plan.allPages)}
            />
          </div>
        </V2Modal>
      ) : null}
    </div>
  );
}

/**
 * Lulu's shipping speeds for this book and address, cheapest first: Standard is chosen until the
 * customer upgrades. Each shows how much more it costs than the current choice and when it should
 * arrive (printing time included). The exact total comes back with the next quote.
 */
function ShippingSpeedPicker({ order }: { order: BookOrder }) {
  const choices = order.shippingChoices;
  if (choices.length < 2) return null;
  // Until the customer picks, nothing is selected and each speed shows its own price.
  const picked = order.shippingChosen;
  const current = picked ? (choices.find((c) => c.level === order.shippingLevel) ?? null) : null;
  return (
    <fieldset data-shipping-speed className="scroll-mt-3">
      <legend className="text-sm font-semibold text-v2-ink">Shipping speed</legend>
      <p className="mt-0.5 text-xs text-v2-muted">
        Dates include printing time and are the printer&apos;s estimate{order.addressComplete ? "" : " until your address is complete"}.
      </p>
      <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Shipping speed">
        {choices.map((choice) => {
          const selected = picked && choice.level === order.shippingLevel;
          const diff =
            current && choice.costCents != null && current.costCents != null ? choice.costCents - current.costCents : null;
          const range = formatDeliveryRange({ min: choice.deliveryMin, max: choice.deliveryMax });
          return (
            <button
              key={choice.level}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={order.quoteLoading}
              onClick={() => {
                            order.chooseShippingLevel(choice.level);
              }}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border-2 px-3 py-2 text-left transition disabled:opacity-60",
                selected ? "border-v2-primary bg-white shadow-[0_0_0_3px_rgb(86_79_208/0.12)]" : "border-gray-200 bg-white hover:border-v2-primary/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  selected ? "border-v2-primary bg-v2-primary text-white" : "border-gray-300",
                )}
                aria-hidden
              >
                {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-bold text-v2-ink">
                    {choice.label}
                    {choice.service ? <span className="font-normal text-v2-muted"> · {choice.service}</span> : null}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-v2-ink">
                    {selected
                      ? "Selected"
                      : !current
                        ? choice.costCents != null
                          ? formatCredits(choice.costCents)
                          : ""
                        : diff == null
                          ? ""
                          : diff > 0 ? `+${formatCredits(diff)}` : diff < 0 ? `−${formatCredits(-diff)}` : "Same price"}
                  </span>
                </span>
                {range ? <span className="mt-0.5 block text-xs text-v2-muted">Arrives {range}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ConfirmButton({
  order,
  blocker,
  onConfirm,
  className,
}: {
  order: BookOrder;
  blocker: string | null;
  onConfirm: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <button type="button" className="v2-btn-primary min-h-12 w-full text-base" disabled={blocker != null} onClick={onConfirm}>
        Review and order
      </button>
      {blocker ? (
        <p className="mt-1.5 text-center text-xs text-v2-muted" role="status">
          {blocker}
        </p>
      ) : order.shortfallCents > 0 && (order.balanceCents ?? 0) > 0 ? (
        <p className="mt-1.5 text-center text-xs text-v2-muted">You&apos;ll pay the remaining {formatCredits(order.shortfallCents)} at checkout.</p>
      ) : null}
    </div>
  );
}
