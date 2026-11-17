"use client";

import { activePageVersion, pageSourceVersion } from "@/components/v2/studio/order/galleryBookPages";
import { useEffect, useId, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpToLine,
  BookMinus,
  BookPlus,
  Check,
  Clock,
  EllipsisVertical,
  Printer,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { V2SheetGeneratingPlaceholder } from "@/components/v2/V2SheetGeneratingPlaceholder";
import { cn } from "@/lib/cn";
import { useThumbUrl } from "@/lib/v2/thumbnail";
import { photoThumbObjectPosition, type V2PhotoEntry } from "@/lib/v2/studioTypes";

export type CardState = "none" | "queued" | "drawing" | "failed" | "ready";
export type MoveTarget = "start" | "earlier" | "later" | "end";

export type GalleryCardProps = {
  photo: V2PhotoEntry;
  index: number;
  count: number;
  state: CardState;
  /** Book page number; null when the page isn't in the book. */
  bookNumber: number | null;
  leftOut: boolean;
  failureMessage?: string;
  selectMode: boolean;
  /** The book panel is open: shows the check that keeps the page in the book or leaves it out. */
  bookMode?: boolean;
  selected: boolean;
  onOpen: (view: "page" | "photo") => void;
  onMake: () => void;
  onCancel: () => void;
  onMove: (to: MoveTarget) => void;
  onToggleLeftOut: () => void;
  onDelete: () => void;
  /** Opens print, download and send for a finished page. */
  onPrint: () => void;
  onToggleSelect: () => void;
  /** Pointer and touch listeners that start a drag (long-press on phones). */
  dragListeners?: HTMLAttributes<HTMLElement>;
  /** Keyboard reorder handle (dnd-kit attributes + listeners). */
  keyboardHandle?: HTMLAttributes<HTMLButtonElement> & { ref?: (el: HTMLElement | null) => void };
  lifted?: boolean;
  isOverlay?: boolean;
  style?: CSSProperties;
  nodeRef?: (el: HTMLElement | null) => void;
};

function CardMenu({
  index,
  count,
  leftOut,
  canLeaveOut,
  canDelete,
  onMove,
  onToggleLeftOut,
  onDelete,
}: {
  index: number;
  count: number;
  leftOut: boolean;
  canLeaveOut: boolean;
  canDelete: boolean;
  onMove: (to: MoveTarget) => void;
  onToggleLeftOut: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  /** Opens toward whichever side has room, so the menu never runs off a phone screen. */
  const [alignLeft, setAlignLeft] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  const item =
    "flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm font-semibold text-v2-ink hover:bg-v2-bg-subtle disabled:opacity-40";
  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end">
      <button
        ref={buttonRef}
        type="button"
        className="pointer-events-auto flex h-11 w-11 items-center justify-center"
        aria-label={`More for photo ${index + 1}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          setAlignLeft(rect ? rect.right < 220 : false);
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-v2-navy shadow-sm">
          <EllipsisVertical className="h-4 w-4" aria-hidden />
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "pointer-events-auto absolute top-11 z-30 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl",
            alignLeft ? "left-1" : "right-1",
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" className={item} disabled={index === 0} onClick={() => pick(() => onMove("start"))}>
            <ArrowUpToLine className="h-4 w-4 text-v2-muted" aria-hidden />
            Move to start
          </button>
          <button type="button" role="menuitem" className={item} disabled={index === 0} onClick={() => pick(() => onMove("earlier"))}>
            <ArrowLeft className="h-4 w-4 text-v2-muted" aria-hidden />
            Move earlier
          </button>
          <button type="button" role="menuitem" className={item} disabled={index >= count - 1} onClick={() => pick(() => onMove("later"))}>
            <ArrowRight className="h-4 w-4 text-v2-muted" aria-hidden />
            Move later
          </button>
          <button type="button" role="menuitem" className={item} disabled={index >= count - 1} onClick={() => pick(() => onMove("end"))}>
            <ArrowDownToLine className="h-4 w-4 text-v2-muted" aria-hidden />
            Move to end
          </button>
          <div className="my-1 border-t border-gray-100" />
          {canLeaveOut ? (
            <button type="button" role="menuitem" className={item} onClick={() => pick(onToggleLeftOut)}>
              {leftOut ? (
                <BookPlus className="h-4 w-4 text-v2-muted" aria-hidden />
              ) : (
                <BookMinus className="h-4 w-4 text-v2-muted" aria-hidden />
              )}
              {leftOut ? "Put back in book" : "Leave out of book"}
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" role="menuitem" className={cn(item, "text-red-700")} onClick={() => pick(onDelete)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete photo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One photo in the gallery: the photo large, its coloring page as an inset in the lower right.
 * The open button, the inset, "Make page" and ⋮ are sibling buttons, never nested.
 */
export function GalleryCard({
  photo,
  index,
  count,
  state,
  bookNumber,
  leftOut,
  failureMessage,
  selectMode,
  bookMode = false,
  selected,
  onOpen,
  onMake,
  onCancel,
  onMove,
  onToggleLeftOut,
  onDelete,
  onPrint,
  onToggleSelect,
  dragListeners,
  keyboardHandle,
  lifted,
  isOverlay,
  style,
  nodeRef,
}: GalleryCardProps) {
  // One photo per card: the one the page was drawn from (a reframed photo when it was), and that page.
  const source = pageSourceVersion(photo);
  const page = activePageVersion(photo);
  const photoThumb = useThumbUrl(source?.sheet.imageDataUrl ?? photo.previewUrl, source ? source.sheet.thumbUrl : photo.thumbUrl);
  const sheetThumb = useThumbUrl(page?.sheet.imageDataUrl, page?.sheet.thumbUrl);
  const hasPage = state === "ready";
  const label = `Photo ${index + 1}`;
  const caption = leftOut ? "Left out of book" : !hasPage && state !== "drawing" ? "Not in book yet" : null;

  return (
    <div
      ref={nodeRef}
      style={style}
      className={cn(
        "cm-gallery-card relative select-none [-webkit-touch-callout:none] [touch-action:manipulation]",
        lifted && "opacity-40",
      )}
      onContextMenu={(e) => e.preventDefault()}
      {...dragListeners}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-v2-bg-subtle shadow-sm transition",
          selected ? "border-v2-primary ring-2 ring-v2-primary/30" : "border-gray-200",
          // Left out of the book: washed out and gray behind a dashed edge, so it reads as set aside.
          leftOut && !selected && "border-dashed border-gray-300 opacity-55 grayscale shadow-none",
          isOverlay && "scale-[1.04] border-v2-primary shadow-xl shadow-v2-primary/25",
        )}
      >
        {/* The photo: opens the editor */}
        <button
          type="button"
          data-lift-ok
          className="relative block aspect-[3/4] w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-v2-primary"
          aria-label={selectMode ? `${selected ? "Unselect" : "Select"} ${label}` : `Open ${label}`}
          aria-pressed={selectMode ? selected : undefined}
          onClick={() => (selectMode ? onToggleSelect() : onOpen(hasPage ? "page" : "photo"))}
        >
          {photoThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoThumb}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: photoThumbObjectPosition(photo) === "top" ? "center top" : "center center" }}
            />
          ) : null}
        </button>

        {bookNumber != null && !selectMode ? (
          <span
            className="pointer-events-none absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-900/75 px-2 text-xs font-bold tabular-nums text-white"
            title={`Book page ${bookNumber}`}
          >
            <span className="sr-only">Book page </span>
            {bookNumber}
          </span>
        ) : null}

        {/* The inset: the coloring page, or what is happening to it */}
        {state === "ready" ? (
          <button
            type="button"
            data-lift-ok
            className={cn(
              "absolute bottom-2 right-2 aspect-[3/4] w-[52%] overflow-hidden rounded-lg border-2 border-white bg-white shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary",
            )}
            aria-label={`Open the coloring page for ${label}`}
            onClick={() => (selectMode ? onToggleSelect() : onOpen("page"))}
          >
            {sheetThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sheetThumb} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
            ) : null}
            {leftOut ? (
              <span className="absolute inset-x-0 bottom-0 bg-white/90 py-0.5 text-center text-[11px] font-semibold text-v2-muted">
                Left out
              </span>
            ) : null}
          </button>
        ) : state === "drawing" ? (
          <div className="pointer-events-none absolute bottom-2 right-2 aspect-[3/4] w-[52%] overflow-hidden rounded-lg border-2 border-white bg-white shadow-md">
            {photoThumb ? (
              <V2SheetGeneratingPlaceholder imageSrc={photoThumb} compact imageFit="cover" className="h-full w-full" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-v2-primary/30 border-t-v2-primary motion-reduce:animate-none" />
              </span>
            )}
            <span className="sr-only">Drawing the coloring page</span>
          </div>
        ) : state === "queued" ? (
          <div className="absolute bottom-2 right-2 flex aspect-[3/4] w-[52%] flex-col items-center justify-center gap-1 rounded-lg border-2 border-white bg-white/95 text-center shadow-md">
            <Clock className="h-4 w-4 text-v2-muted" aria-hidden />
            <span className="text-xs font-semibold text-v2-muted">Waiting…</span>
            <button
              type="button"
              className="absolute -right-1 -top-1 flex h-11 w-11 items-center justify-center"
              aria-label={`Don't make a page for ${label}`}
              onClick={onCancel}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/75 text-white">
                <X className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>
          </div>
        ) : null}

        {/* No page yet (or it failed): one full-width button along the bottom */}
        {(state === "none" || state === "failed") && !selectMode ? (
          <button
            type="button"
            className={cn(
              "absolute inset-x-2 bottom-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold shadow-md",
              state === "failed" ? "bg-white text-red-700" : "bg-v2-primary text-white",
            )}
            onClick={onMake}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            title={state === "failed" ? failureMessage : undefined}
          >
            {state === "failed" ? (
              <>
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" aria-hidden />
                <RotateCcw className="h-4 w-4" aria-hidden />
                Try again
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4" aria-hidden />
                Make page
              </>
            )}
          </button>
        ) : null}

        {keyboardHandle ? (
          <button
            type="button"
            {...keyboardHandle}
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:bottom-14 focus:z-10 focus:rounded-lg focus:bg-white focus:px-2 focus:py-1 focus:text-xs focus:font-semibold focus:text-v2-navy focus:shadow"
            aria-label={`Reorder ${label}. Press space to pick it up, arrow keys to move, space to drop.`}
          >
            Reorder
          </button>
        ) : null}
      </div>
      {selectMode ? (
        <span
          className={cn(
            "pointer-events-none absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border-2",
            selected ? "border-v2-primary bg-v2-primary text-white" : "border-white bg-white/80",
          )}
          aria-hidden
        >
          {selected ? <Check className="h-4 w-4" /> : null}
        </span>
      ) : (
        <>
          {bookMode && (hasPage || leftOut) ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={!leftOut}
              className={cn(
                "absolute top-0 z-10 flex h-11 w-11 items-center justify-center",
                hasPage ? "right-[5.5rem]" : "right-11",
              )}
              aria-label={`Include ${label} in the book`}
              title={leftOut ? "Left out of the book. Click to put it back." : "In the book. Click to leave it out."}
              onClick={onToggleLeftOut}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-sm transition-colors",
                  leftOut ? "border-gray-400 bg-white/90 text-transparent hover:text-gray-300" : "border-v2-primary bg-v2-primary text-white",
                )}
              >
                <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
              </span>
            </button>
          ) : null}
          {hasPage ? (
            <button
              type="button"
              className="absolute right-11 top-0 z-10 flex h-11 w-11 items-center justify-center"
              aria-label={`Print or share the coloring page for ${label}`}
              title="Print or share"
              onClick={onPrint}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-v2-navy shadow-sm">
                <Printer className="h-4 w-4" aria-hidden />
              </span>
            </button>
          ) : null}
          <CardMenu
          index={index}
          count={count}
          leftOut={leftOut}
          canLeaveOut={hasPage || leftOut}
          canDelete={photo.canDelete !== false && state !== "drawing"}
          onMove={onMove}
          onToggleLeftOut={onToggleLeftOut}
          onDelete={onDelete}
        />
        </>
      )}

      {caption ? (
        <p className="mt-1 truncate text-center text-xs text-v2-muted">
          {state === "failed"
            ? failureMessage && failureMessage.length <= 48
              ? failureMessage
              : "This page needs another try"
            : caption}
        </p>
      ) : (
        <p className="mt-1 h-4" aria-hidden />
      )}
    </div>
  );
}

/** The photo, or its finished coloring page, filling its (relative) parent. Used by the Arrange sheet. */
export function GalleryThumb({ photo, preferPage }: { photo: V2PhotoEntry; preferPage: boolean }) {
  const source = pageSourceVersion(photo);
  const page = activePageVersion(photo);
  const photoThumb = useThumbUrl(source?.sheet.imageDataUrl ?? photo.previewUrl, source ? source.sheet.thumbUrl : photo.thumbUrl);
  const sheetThumb = useThumbUrl(page?.sheet.imageDataUrl, page?.sheet.thumbUrl);
  const showPage = preferPage && sheetThumb;
  const src = showPage ? sheetThumb : photoThumb;
  if (!src) return <span className="absolute inset-0 bg-v2-bg-subtle" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      decoding="async"
      className="pointer-events-none absolute inset-0 h-full w-full bg-white object-cover"
      style={showPage ? undefined : { objectPosition: photoThumbObjectPosition(photo) === "top" ? "center top" : "center center" }}
    />
  );
}

export function GallerySkeletonCard() {
  return (
    <div aria-hidden>
      <div className="flex aspect-[3/4] w-full animate-pulse items-center justify-center rounded-2xl border border-gray-200 bg-v2-bg-subtle motion-reduce:animate-none">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-v2-primary/30 border-t-v2-primary motion-reduce:animate-none" />
      </div>
      <p className="mt-1 h-4" />
    </div>
  );
}
