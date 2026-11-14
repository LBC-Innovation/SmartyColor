"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { AlertCircle, BookOpen, Check, ChevronDown, Gift, ImageOff, LayoutGrid, Loader2, Palette } from "lucide-react";
import { BookBindingPicker } from "@/components/v2/book-order/BookBindingPicker";
import { BookCoverCanvas } from "@/components/v2/book-order/BookCoverCanvas";
import { BookCoverDesigner } from "@/components/v2/book-order/BookCoverDesigner";
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
import { fillCopy, numberValues } from "@/lib/marketing/copy";
import { holidayOrderBy } from "@/lib/marketing/holiday";
import { requestMigrationAfterSignup } from "@/lib/marketing/savePrompt";
import { useMarketingNumbers } from "@/lib/marketing/useMarketingNumbers";
import { GIFT_NOTE_MAX_CHARS } from "@/lib/orders/giftNote";
import type { BookBindingId } from "@/lib/print/bookBindings";
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
  onConfirm: () => void;
  /** Where the panel sits: the sticky desktop column or the phone sheet (which has its own footer). */
  variant: "column" | "sheet";
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
    <section className="border-b border-gray-100 last:border-b-0">
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
      <dd className="font-semibold tabular-nums text-v2-ink">{loading ? "…" : cents != null ? formatCredits(cents) : "Not yet"}</dd>
    </div>
  );
}

/** Why "Confirm and buy" can't be pressed yet, or null when it can. */
export function confirmBlocker(order: BookOrder): string | null {
  if (!order.signedIn) return "Create a free account to finish your book.";
  if (order.contentCount === 0) return "Make at least one coloring page first.";
  if (order.pagesStillDrawing > 0)
    return `${order.pagesStillDrawing} ${order.pagesStillDrawing === 1 ? "page is" : "pages are"} still being made.`;
  if (order.overCapacity) return `${order.binding.shortLabel} holds up to ${order.binding.maxPages} pages.`;
  if (!order.isDigital && !order.addressesReady) return "Add a shipping address.";
  if (order.quoteLoading) return "Getting the price…";
  if (order.quoteCents == null) return order.quoteError ?? "Waiting for the price.";
  return null;
}

/**
 * "Your book": format, pages, cover and address as rows that open one at a time, with the total
 * and "Confirm and buy" under them. The same rows in the desktop column and the phone sheet.
 */
export function BookOrderPanel({ order, withoutPage, leftOut, openRow, onOpenRow, onShowGallery, onConfirm, variant }: Props) {
  const idBase = useId();
  const numbers = useMarketingNumbers(!order.signedIn);
  const [designerOpen, setDesignerOpen] = useState(false);
  const holiday = holidayOrderBy();
  const holidayLine = holiday ? fillCopy(HOLIDAY_LINE, { date: holiday.label }) : null;
  const examplePrice = !order.signedIn && numbers ? fillCopy(PRICE_LINE, numberValues(numbers)) : null;
  const printed = !order.isDigital;
  const fit = { fits: order.formatFits, tooMany: order.overCapacity };
  const shortBy = Math.max(0, order.binding.minPages - order.contentCount);

  function toggle(row: OrderRow) {
    order.touch();
    onOpenRow(openRow === row ? null : row);
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

  const formatState = order.contentCount > 0 && fit.fits && !fit.tooMany ? "done" : "warn";
  const pagesState =
    order.contentCount === 0 || fit.tooMany || order.pagesStillDrawing > 0 || shortBy > 0 ? "warn" : "done";
  const coverTitleIsAutomatic = isAutomaticAlbumName(order.coverDesign.text ?? "");
  const coverState = coverTitleIsAutomatic ? "warn" : "done";
  const shipState = order.addressesReady ? "done" : "todo";
  const pictureIndex =
    order.coverDesign.layout === "photo"
      ? Math.max(1, order.coverPictures.findIndex((p) => p.pageId === order.coverDesign.coverPageId) + 1)
      : null;
  const coverSummary = `“${order.coverTitle}” · ${
    order.coverDesign.layout === "none" ? "no picture" : pictureIndex ? `picture ${pictureIndex}` : "all pictures"
  }`;
  const shipSummary = order.addressComplete
    ? [order.shippingAddress.name, order.shippingAddress.street1, order.shippingAddress.city].filter(Boolean).join(", ")
    : "Add an address";
  const blocker = confirmBlocker(order);

  const coverChoices = order.coverPictures.slice(0, 6);

  return (
    <div>
      {order.error ? (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {order.error}
        </p>
      ) : null}

      <Row
        id={`${idBase}-format`}
        number={1}
        label="Format"
        summary={`${order.binding.shortLabel} · ${order.plan.totalPages} pages`}
        state={formatState}
        open={openRow === "format"}
        onToggle={() => toggle("format")}
      >
        <BookBindingPicker
          layout="list"
          value={order.bindingId}
          prices={order.formatPrices}
          contentPageCount={order.contentCount}
          recommendedId={order.recommendedFormat}
          digitalPriceCents={order.digitalCents}
          onChange={(id) => {
            order.touch();
            order.chooseFormat(id);
          }}
        />
        {examplePrice ? <p className="mt-3 text-xs text-v2-muted">{examplePrice}</p> : null}
      </Row>

      <Row
        id={`${idBase}-pages`}
        number={2}
        label="Pages"
        summary={`${order.contentCount} ${order.contentCount === 1 ? "page" : "pages"}`}
        state={pagesState}
        open={openRow === "pages"}
        onToggle={() => toggle("pages")}
      >
        <div className="space-y-2 text-sm text-v2-ink">
          <p>
            {order.contentCount} coloring {order.contentCount === 1 ? "page" : "pages"} in the order of your gallery
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
            Change order in the gallery
          </button>
        </div>
      </Row>

      {printed && order.signedIn ? (
        <>
          <Row
            id={`${idBase}-cover`}
            number={3}
            label="Cover"
            summary={coverTitleIsAutomatic ? "Check your cover title" : coverSummary}
            state={coverState}
            open={openRow === "cover"}
            onToggle={() => toggle("cover")}
          >
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-v2-ink" htmlFor={`${idBase}-title`}>
                Title
              </label>
              <input
                id={`${idBase}-title`}
                className="v2-input w-full"
                value={order.coverDesign.text}
                maxLength={120}
                onChange={(e) => order.updateCover({ ...order.coverDesign, text: e.target.value })}
              />
              {coverTitleIsAutomatic ? (
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
                    aria-checked={order.coverDesign.layout === "grid"}
                    aria-label="All pictures"
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg border-2 bg-white text-v2-muted",
                      order.coverDesign.layout === "grid" ? "border-v2-primary" : "border-gray-200",
                    )}
                    onClick={() => order.updateCover({ ...order.coverDesign, layout: "grid" })}
                  >
                    <LayoutGrid className="h-5 w-5" aria-hidden />
                  </button>
                  {coverChoices.map((picture, i) => {
                    const on = order.coverDesign.layout === "photo" && (order.coverDesign.coverPageId ?? coverChoices[0]?.pageId) === picture.pageId;
                    return (
                      <button
                        key={picture.pageId}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`Picture ${i + 1}`}
                        className={cn("relative aspect-square overflow-hidden rounded-lg border-2", on ? "border-v2-primary" : "border-gray-200")}
                        onClick={() => order.updateCover({ ...order.coverDesign, layout: "photo", coverPageId: picture.pageId })}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={picture.src} alt="" className="h-full w-full object-cover" />
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={order.coverDesign.layout === "none"}
                    aria-label="No picture"
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg border-2 bg-white text-v2-muted",
                      order.coverDesign.layout === "none" ? "border-v2-primary" : "border-gray-200",
                    )}
                    onClick={() => order.updateCover({ ...order.coverDesign, layout: "none" })}
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
            state={shipState}
            open={openRow === "ship"}
            onToggle={() => toggle("ship")}
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
            </div>
          </Row>
        </>
      ) : null}

      {!printed && order.signedIn ? (
        <p className="border-b border-gray-100 py-3 text-sm text-v2-muted">Delivered as a download in My orders.</p>
      ) : null}

      {!order.signedIn ? (
        <div className="mt-3 rounded-2xl border border-v2-primary/25 bg-v2-primary-light/60 p-4 text-center">
          <p className="text-sm font-semibold text-v2-ink">Create a free account to finish your book. Your pages come with you.</p>
          <Link
            href={withNextParam("/sign-up", STUDIO_PATH)}
            onClick={requestMigrationAfterSignup}
            className="v2-btn-primary mt-3 min-h-11 w-full text-sm"
          >
            {GUEST_GATES.book.primary}
          </Link>
          <Link
            href={withNextParam("/sign-in", STUDIO_PATH)}
            onClick={requestMigrationAfterSignup}
            className="mt-1 inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-v2-link underline-offset-2 hover:underline"
          >
            {GUEST_GATES.book.secondary}
          </Link>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-v2-bg-subtle/70 p-4">
          <dl className="space-y-1.5 text-sm">
            {order.isDigital ? (
              <Money label="Print-at-home PDF" cents={order.quoteCents} loading={order.quoteLoading} />
            ) : (
              <>
                <Money label="Book" cents={order.printCents} loading={order.quoteLoading} />
                <Money label="Shipping" cents={order.shippingCents} loading={order.quoteLoading} />
                <Money label="Sales tax" cents={order.taxCents} loading={order.quoteLoading} />
              </>
            )}
            <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
              <dt className="font-semibold text-v2-ink">Total</dt>
              <dd className="text-lg font-bold tabular-nums text-v2-ink">
                {order.quoteLoading ? "…" : order.quoteCents != null ? formatCredits(order.quoteCents) : "Not yet"}
              </dd>
            </div>
          </dl>
          {!order.isDigital && !order.addressComplete ? (
            <p className="mt-1 text-xs text-v2-muted">Shipping and tax are estimated until the address is complete.</p>
          ) : null}
          {order.quoteError ? <p className="mt-1 text-xs text-amber-800">{order.quoteError}</p> : null}
          {order.balanceCents != null ? (
            <p className="mt-2 text-xs text-v2-muted">
              Your credit: <span className="font-semibold text-v2-ink tabular-nums">{formatCredits(order.balanceCents)}</span>
              {order.shortfallCents > 0 ? <> · Add {formatCredits(order.shortfallCents)} at checkout</> : null}
            </p>
          ) : null}
          {printed && holidayLine ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-v2-navy">
              <Gift className="h-3.5 w-3.5 shrink-0 text-v2-primary" aria-hidden />
              {holidayLine}
            </p>
          ) : null}
        </div>
      )}

      {variant === "column" && order.signedIn ? (
        <ConfirmButton order={order} blocker={blocker} onConfirm={onConfirm} className="mt-4" />
      ) : null}

      {designerOpen ? (
        <V2Modal title={<span className="text-base font-semibold text-v2-ink">Cover</span>} onClose={() => setDesignerOpen(false)} maxWidthClass="max-w-3xl">
          <div className="p-4 sm:p-6">
            <BookCoverDesigner
              design={order.coverDesign}
              onChange={order.updateCover}
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
        Confirm and buy
      </button>
      {blocker ? (
        <p className="mt-1.5 text-center text-xs text-v2-muted" role="status">
          {blocker}
        </p>
      ) : order.shortfallCents > 0 ? (
        <p className="mt-1.5 text-center text-xs text-v2-muted">You&apos;ll add {formatCredits(order.shortfallCents)} of credit at checkout.</p>
      ) : null}
    </div>
  );
}
