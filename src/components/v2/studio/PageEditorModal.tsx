"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  BookMinus,
  BookPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Ellipsis,
  Eraser,
  FlipHorizontal2,
  History,
  Loader2,
  PencilLine,
  Printer,
  RefreshCw,
  RotateCw,
  Share2,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { V2SheetGeneratingPlaceholder } from "@/components/v2/V2SheetGeneratingPlaceholder";
import { V2SheetRevisionStrip } from "@/components/v2/V2SheetRevisionStrip";
import { V2WorkingOverlay } from "@/components/v2/V2WorkingOverlay";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { useLayerHistory } from "@/components/v2/studio/useLayerHistory";
import { activePageVersion } from "@/components/v2/studio/order/galleryBookPages";
import { cn } from "@/lib/cn";
import { BOLDER_MAX_LEVEL, bolderLevel, type QuickFixKind } from "@/lib/photo/sheetQuickFixes";
import type { CardState } from "@/components/v2/studio/GalleryCard";
import {
  activeSheetVersion,
  activeSourceVersion,
  normalizeV2SheetRevisions,
  type V2PhotoEntry,
} from "@/lib/v2/studioTypes";

export type EditorView = "page" | "photo";

type Props = {
  photo: V2PhotoEntry;
  index: number;
  total: number;
  initialView: EditorView;
  state: CardState;
  failureMessage?: string;
  /** The photo has an operation running (drawing, an edit, a quick fix). */
  busy: boolean;
  /** "Free" for guests, the price when signed in; null while unknown. */
  makeCostLabel: string | null;
  editCostLabel: string | null;
  leftOut: boolean;
  canShare: boolean;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onMake: () => void;
  onDrawAgain: () => void;
  onQuickFix: (kind: QuickFixKind) => void;
  onSetFit: (fit: "framed" | "full") => void;
  onSelectRevision: (revisionId: string) => void;
  onFlipPhotoToo: () => void;
  onEditWithNote: () => void;
  onPrint: () => void;
  onShare: () => void;
  onToggleLeftOut: () => void;
  onDelete: () => void;
  /** Shown after a quick fix: goes back to the version before it. */
  onUndo?: () => void;
};

/**
 * The page editor: the coloring page large, free quick fixes, paid changes, and the rest. Phones get
 * it full screen; desktop a large dialog. Back closes it, ‹ › and swipe move between pages.
 */
export function PageEditorModal(props: Props) {
  const {
    photo,
    index,
    total,
    initialView,
    state,
    failureMessage,
    busy,
    makeCostLabel,
    editCostLabel,
    leftOut,
    canShare,
    onClose,
    onPrev,
    onNext,
  } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useModalLayer({ panelRef, initialFocusRef: bodyRef, onClose });
  useLayerHistory(true, onClose);

  const revisions = normalizeV2SheetRevisions(photo);
  const versioned = { ...photo, sheetRevisions: revisions };
  const pageVersion = activePageVersion(photo);
  const anyVersion = activeSheetVersion(versioned);
  const source = activeSourceVersion(versioned);
  const photoSrc = source?.sheet.imageDataUrl ?? photo.previewUrl;
  const hasPage = Boolean(pageVersion && photo.sheet);
  const [viewFor, setViewFor] = useState<{ id: string; view: EditorView }>({ id: photo.id, view: initialView });
  const view: EditorView = !hasPage ? "photo" : viewFor.id === photo.id ? viewFor.view : "page";
  const [zoomed, setZoomed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const fit = photo.printPrefs.book?.fit === "full" ? "full" : "framed";
  const bolder = bolderLevel(pageVersion?.sheet.title);
  const firstPage = revisions.find((r) => r.kind !== "photo");

  // A new page on show starts unzoomed.
  const [zoomFor, setZoomFor] = useState(photo.id);
  if (zoomFor !== photo.id) {
    setZoomFor(photo.id);
    setZoomed(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  // Horizontal swipe on the picture moves between pages; off while zoomed in.
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);
  function onPointerDown(e: ReactPointerEvent) {
    if (zoomed || e.pointerType === "mouse") return;
    swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  function onPointerUp(e: ReactPointerEvent) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || start.id !== e.pointerId || zoomed) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) onNext?.();
    else onPrev?.();
  }

  const shownSrc = view === "page" && hasPage ? photo.sheet!.imageDataUrl : photoSrc;
  const fixDisabled = busy || !hasPage;

  const fixButton =
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-v2-navy transition hover:border-v2-primary/40 disabled:cursor-not-allowed disabled:opacity-40";
  const actionButton =
    "inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-40";

  const otherActions = (
    <>
      <button type="button" className={actionButton} disabled={fixDisabled} onClick={() => props.onQuickFix("clean")}>
        <Eraser className="h-4 w-4 text-v2-muted" aria-hidden />
        Lighter and cleaner
      </button>
      <button
        type="button"
        className={actionButton}
        disabled={busy || !firstPage || firstPage.id === pageVersion?.id}
        onClick={() => firstPage && props.onSelectRevision(firstPage.id)}
      >
        <History className="h-4 w-4 text-v2-muted" aria-hidden />
        Restore original
      </button>
      <button type="button" className={actionButton} disabled={busy} onClick={props.onFlipPhotoToo}>
        <FlipHorizontal2 className="h-4 w-4 text-v2-muted" aria-hidden />
        Flip the photo too
      </button>
      <button type="button" className={actionButton} disabled={!hasPage || busy} onClick={props.onPrint}>
        <Printer className="h-4 w-4 text-v2-muted" aria-hidden />
        Print free
      </button>
      {canShare ? (
        <button type="button" className={actionButton} disabled={busy} onClick={props.onShare}>
          <Share2 className="h-4 w-4 text-v2-muted" aria-hidden />
          Share
        </button>
      ) : null}
      {hasPage || leftOut ? (
        <button type="button" className={actionButton} onClick={props.onToggleLeftOut}>
          {leftOut ? <BookPlus className="h-4 w-4 text-v2-muted" aria-hidden /> : <BookMinus className="h-4 w-4 text-v2-muted" aria-hidden />}
          {leftOut ? "Put back in book" : "Leave out of book"}
        </button>
      ) : null}
      {photo.canDelete !== false ? (
        <button type="button" className={cn(actionButton, "text-red-700")} disabled={busy} onClick={props.onDelete}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete photo
        </button>
      ) : null}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center lg:items-center lg:p-6" role="dialog" aria-modal="true" aria-label={`Page ${index + 1} of ${total}`}>
      <button type="button" tabIndex={-1} className="absolute inset-0 hidden bg-v2-ink/40 backdrop-blur-[2px] lg:block" aria-label="Close" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="cm-sheet-up relative flex h-full w-full flex-col overflow-hidden bg-v2-surface focus:outline-none lg:h-[min(860px,calc(100dvh-3rem))] lg:max-w-[960px] lg:rounded-2xl lg:border lg:border-gray-200 lg:shadow-[0_24px_64px_rgb(10_16_26/0.18)]"
      >
        <header className="flex shrink-0 items-center gap-1 border-b border-gray-100 px-2 pt-[env(safe-area-inset-top)] sm:px-3">
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle" aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-v2-ink sm:text-base" aria-live="polite">
            Page {index + 1} of {total}
          </h2>
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-30" aria-label="Previous page" disabled={!onPrev} onClick={() => onPrev?.()}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-30" aria-label="Next page" disabled={!onNext} onClick={() => onNext?.()}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:overflow-hidden">
          {/* Picture */}
          <div className="flex min-h-[55dvh] flex-col p-3 sm:p-4 lg:min-h-0">
            {hasPage ? (
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5" role="group" aria-label="Show">
                  {(["page", "photo"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      onClick={() => setViewFor({ id: photo.id, view: v })}
                      className={cn(
                        "min-h-9 rounded-full px-4 text-sm font-semibold",
                        view === v ? "bg-v2-primary text-white" : "text-v2-navy",
                      )}
                    >
                      {v === "page" ? "Page" : "Photo"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-v2-navy"
                  aria-label={zoomed ? "Zoom out" : "Zoom in"}
                  aria-pressed={zoomed}
                  onClick={() => setZoomed((z) => !z)}
                >
                  {zoomed ? <ZoomOut className="h-4 w-4" aria-hidden /> : <ZoomIn className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            ) : null}
            <div
              className={cn(
                "relative min-h-0 flex-1 overflow-hidden rounded-xl bg-v2-bg-subtle",
                zoomed ? "overflow-auto touch-pan-x touch-pan-y" : "touch-pan-y",
              )}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (swipeRef.current = null)}
              onDoubleClick={() => hasPage && setZoomed((z) => !z)}
            >
              {state === "drawing" && !hasPage ? (
                <V2SheetGeneratingPlaceholder imageSrc={photoSrc} imageAlt="Your photo being drawn" className="absolute inset-0 h-full w-full" />
              ) : (
                <div className={cn("flex h-full w-full items-center justify-center", zoomed && "h-[200%] w-[200%]")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={shownSrc.slice(-48)}
                    src={shownSrc}
                    alt={view === "page" ? "Coloring page" : "Your photo"}
                    draggable={false}
                    className="v2-sheet-reveal pointer-events-none max-h-full max-w-full select-none object-contain"
                  />
                </div>
              )}
              {photo.correcting ? <V2WorkingOverlay variant="edit" label="Applying your change to the coloring page." /> : null}
              {!hasPage && state !== "drawing" ? (
                <div className="absolute inset-x-3 bottom-3 flex flex-col items-center gap-2 rounded-2xl bg-white/95 p-3 text-center shadow-lg">
                  {state === "queued" ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-v2-muted">
                      <Clock className="h-4 w-4" aria-hidden />
                      Waiting for its turn…
                    </p>
                  ) : (
                    <>
                      {state === "failed" ? (
                        <p className="text-sm text-red-700" role="alert">
                          {failureMessage ?? "That didn't work."}
                        </p>
                      ) : null}
                      <button type="button" className="v2-btn-primary min-h-12 w-full max-w-sm text-base" disabled={busy} onClick={props.onMake}>
                        <PencilLine className="h-5 w-5" aria-hidden />
                        {state === "failed" ? "Try again" : "Make coloring page"}
                        {makeCostLabel ? <span className="font-normal opacity-90">· {makeCostLabel}</span> : null}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            {props.onUndo ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-v2-ink px-3 py-1.5 text-sm text-white" role="status">
                <span>Page changed. It is a new version.</span>
                <button type="button" className="min-h-9 rounded-full px-3 font-semibold underline-offset-2 hover:underline" onClick={props.onUndo}>
                  Undo
                </button>
              </div>
            ) : null}
            {hasPage && revisions.length > 1 ? (
              <V2SheetRevisionStrip
                variant="compact"
                className="mt-2 shrink-0"
                revisions={revisions}
                activeRevisionId={anyVersion?.id ?? null}
                onSelect={props.onSelectRevision}
                disabled={busy}
              />
            ) : null}
          </div>

          {/* Tools */}
          <div className="shrink-0 space-y-4 border-t border-gray-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
            {hasPage ? (
              <section aria-labelledby="quick-fixes">
                <h3 id="quick-fixes" className="mb-2 text-xs font-semibold uppercase tracking-wider text-v2-muted">
                  Quick fixes
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={fixButton} disabled={fixDisabled} onClick={() => props.onQuickFix("flip")}>
                    <FlipHorizontal2 className="h-4 w-4" aria-hidden />
                    Flip
                  </button>
                  <button
                    type="button"
                    className={fixButton}
                    disabled={fixDisabled}
                    onClick={() => props.onQuickFix("rotate")}
                    title="Turns the page upside down"
                  >
                    <RotateCw className="h-4 w-4" aria-hidden />
                    Rotate
                  </button>
                  <div className="col-span-1 inline-flex min-h-11 overflow-hidden rounded-xl border border-gray-200 bg-white" role="group" aria-label="Fit or fill the page">
                    {(["framed", "full"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={fit === f}
                        disabled={busy}
                        onClick={() => props.onSetFit(f)}
                        className={cn(
                          "flex-1 text-sm font-semibold",
                          fit === f ? "bg-v2-primary text-white" : "text-v2-navy",
                        )}
                        title={f === "framed" ? "Fit inside the margins" : "Fill the page edge to edge"}
                      >
                        {f === "framed" ? "Fit" : "Fill"}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={fixButton}
                    disabled={fixDisabled || bolder >= BOLDER_MAX_LEVEL}
                    onClick={() => props.onQuickFix("bolder")}
                  >
                    <PencilLine className="h-4 w-4" aria-hidden />
                    Bolder lines
                  </button>
                </div>
              </section>
            ) : null}

            {hasPage ? (
              <section aria-labelledby="change-drawing">
                <h3 id="change-drawing" className="mb-2 text-xs font-semibold uppercase tracking-wider text-v2-muted">
                  Change the drawing
                </h3>
                <div className="grid gap-2">
                  <button type="button" className="v2-btn-primary min-h-11 w-full text-sm" disabled={busy} onClick={props.onEditWithNote}>
                    <PencilLine className="h-4 w-4" aria-hidden />
                    Edit with a note
                    {editCostLabel ? <span className="font-normal opacity-90">· {editCostLabel}</span> : null}
                  </button>
                  <button type="button" className="v2-btn-outline min-h-11 w-full text-sm" disabled={busy || state === "queued"} onClick={props.onDrawAgain}>
                    {state === "drawing" ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                    ) : (
                      <RefreshCw className="h-4 w-4" aria-hidden />
                    )}
                    Draw it again
                    {makeCostLabel ? <span className="font-normal text-v2-muted">· {makeCostLabel}</span> : null}
                  </button>
                </div>
              </section>
            ) : null}

            <section>
              <button
                type="button"
                className="inline-flex min-h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-v2-navy lg:hidden"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
              >
                More
                <Ellipsis className="h-4 w-4" aria-hidden />
              </button>
              <div className={cn("mt-1 flex-col", moreOpen ? "flex" : "hidden lg:flex")}>{otherActions}</div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
