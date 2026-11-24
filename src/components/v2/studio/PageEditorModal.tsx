"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  BookMinus,
  BookPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  FlipHorizontal2,
  History,
  Loader2,
  Maximize2,
  MessageSquareText,
  PencilLine,
  Printer,
  RefreshCw,
  RotateCw,
  Share2,
  Trash2,
  X,
  Download,
  RectangleHorizontal,
  RectangleVertical,
} from "lucide-react";
import { V2SheetGeneratingPlaceholder } from "@/components/v2/V2SheetGeneratingPlaceholder";
import { V2SheetRevisionStrip } from "@/components/v2/V2SheetRevisionStrip";
import { V2WorkingOverlay } from "@/components/v2/V2WorkingOverlay";
import { AddToAlbumMenu, type AddToAlbumDestination, type AddToAlbumOption } from "@/components/v2/studio/AddToAlbumMenu";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { useLayerHistory } from "@/components/v2/studio/useLayerHistory";
import { activePageVersion, pageSourceVersion, pageVersions } from "@/components/v2/studio/order/galleryBookPages";
import { cn } from "@/lib/cn";
import type { QuickFixKind } from "@/lib/photo/sheetQuickFixes";
import type { CardState } from "@/components/v2/studio/GalleryCard";
import type { QueueStatus } from "@/components/v2/studio/useSheetQueue";
import type { ReframeTarget } from "@/lib/session/photoTypes";
import { screenSrc } from "@/lib/v2/cloudLibrary";
import {
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
  onSelectRevision: (revisionId: string) => void;
  onEditWithNote: () => void;
  /** Print through the browser's print dialog; Download saves the PDF; Share opens sending. */
  onPrint: () => void;
  onDownload: () => void;
  onShare: () => void;
  /** Which of Print or Download is getting the PDF ready. */
  pdfBusy: "print" | "download" | null;
  /** Turn the page to the other shape: what the button says and what it costs. */
  shape: { label: string; costLabel: string | null } | null;
  /**
   * The page's job in the drawing queue: waiting for a free spot or being drawn, how many wait
   * ahead of it, and the shape it is turning the page to (null for a redraw in the same shape).
   */
  job: { status: QueueStatus; ahead: number; reshapeTo: ReframeTarget | null } | null;
  onChangeShape: () => void;
  onToggleLeftOut: () => void;
  onDelete: () => void;
  /** Shown after a quick fix: goes back to the version before it. */
  onUndo?: () => void;
  /** "Add this photo to" an album; left out when the photo can't be copied (guests, still uploading). */
  addToAlbum?: {
    albums: AddToAlbumOption[];
    currentAlbumId: string | null;
    onAdd: (destination: AddToAlbumDestination) => Promise<void>;
  };
};

/** One row in the tools panel: an icon tile, what it does, and (on the right) what it costs. */
function ActionRow({
  icon,
  label,
  detail,
  onClick,
  disabled,
  primary,
  danger,
}: {
  icon: ReactNode;
  label: string;
  detail?: string | null;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        primary ? "bg-v2-primary-light/60 text-v2-ink hover:bg-v2-primary-light" : "text-v2-navy hover:bg-v2-bg-subtle",
        danger && "text-red-700",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4",
          primary ? "bg-v2-primary text-white" : danger ? "bg-red-50 text-red-700" : "bg-v2-bg-subtle text-v2-navy",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      {detail ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
            primary ? "bg-white text-v2-link" : "bg-v2-bg-subtle text-v2-muted",
          )}
        >
          {detail}
        </span>
      ) : null}
    </button>
  );
}

const panelCard = "overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm";
const panelHeading = "mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-v2-muted";

/**
 * The page editor: the coloring page large, a print and share toolbar on top, and a panel of tools
 * (quick fixes, changes to the drawing, the rest). Phones get it full screen; desktop a large
 * dialog. Back closes it, ‹ › and swipe move between pages.
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
  // One photo, many pages: the strip lists coloring pages only, and "Photo" is the photo behind
  // the page on show (the reframed one when the page was drawn from it).
  const pageVersion = activePageVersion(photo);
  const pages = pageVersions(photo);
  const source = pageSourceVersion(photo);
  // Looking only: screen-sized copies unless the full-size file is already on this device.
  const photoSrc = source
    ? screenSrc(source.sheet.imageDataUrl, source.sheet.displayUrl)
    : screenSrc(photo.previewUrl, photo.displayUrl);
  const hasPage = Boolean(pageVersion);
  const [viewFor, setViewFor] = useState<{ id: string; view: EditorView }>({ id: photo.id, view: initialView });
  const view: EditorView = !hasPage ? "photo" : viewFor.id === photo.id ? viewFor.view : "page";
  const [fullScreen, setFullScreen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const firstPage = revisions.find((r) => r.kind !== "photo");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (fullScreen || (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext, fullScreen]);

  // Horizontal swipe on the picture moves between pages.
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);
  function onPointerDown(e: ReactPointerEvent) {
    if (e.pointerType === "mouse") return;
    swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  function onPointerUp(e: ReactPointerEvent) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) onNext?.();
    else onPrev?.();
  }

  const shownSrc =
    view === "page" && pageVersion ? screenSrc(pageVersion.sheet.imageDataUrl, pageVersion.sheet.displayUrl) : photoSrc;
  const fixDisabled = busy || !hasPage;
  const ShapeIcon = props.shape?.label.includes("landscape") ? RectangleHorizontal : RectangleVertical;
  const job = props.job;
  const reshaping = job?.reshapeTo ?? null;
  const aheadText = job && job.ahead > 0 ? `${job.ahead} ${job.ahead === 1 ? "page" : "pages"} ahead of it` : null;
  const shapeRow = reshaping ? (
    <ActionRow
      icon={job!.status === "running" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Clock />}
      label={`Making it ${reshaping}`}
      detail={job!.status === "running" ? "Drawing…" : "In line"}
      disabled
      onClick={props.onChangeShape}
    />
  ) : props.shape ? (
    <ActionRow
      icon={<ShapeIcon />}
      label={props.shape.label}
      detail={props.shape.costLabel}
      disabled={busy || state === "queued"}
      onClick={props.onChangeShape}
    />
  ) : null;

  const fixTile =
    "flex min-h-12 flex-1 items-center justify-center gap-2 px-3 text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle disabled:cursor-not-allowed disabled:opacity-40";
  const toolbarButton =
    "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 text-sm font-semibold text-v2-navy shadow-sm transition hover:border-v2-primary/40 hover:bg-v2-bg-subtle disabled:cursor-not-allowed disabled:opacity-40";

  const otherActions = (
    <div className={cn(panelCard, "divide-y divide-gray-100")}>
      {hasPage ? (
        <ActionRow icon={<Eraser />} label="Lighter and cleaner" detail="Free" disabled={fixDisabled} onClick={() => props.onQuickFix("clean")} />
      ) : null}
      {hasPage ? (
        <ActionRow
          icon={<History />}
          label="Restore original"
          disabled={busy || !firstPage || firstPage.id === pageVersion?.id}
          onClick={() => firstPage && props.onSelectRevision(firstPage.id)}
        />
      ) : null}
      {hasPage || leftOut ? (
        <ActionRow
          icon={leftOut ? <BookPlus /> : <BookMinus />}
          label={leftOut ? "Put back in book" : "Leave out of book"}
          onClick={props.onToggleLeftOut}
        />
      ) : null}
      {photo.canDelete !== false ? (
        <ActionRow icon={<Trash2 />} label="Delete photo" danger disabled={busy} onClick={props.onDelete} />
      ) : null}
    </div>
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

        {hasPage || props.addToAlbum ? (
          <div
            role="toolbar"
            aria-label="Print, share and add to album"
            className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-gray-100 bg-v2-bg-subtle/70 px-3 py-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden"
          >
            {hasPage ? (
              <>
                <button type="button" className={toolbarButton} disabled={busy || props.pdfBusy != null} onClick={props.onPrint}>
                  {props.pdfBusy === "print" ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : (
                    <Printer className="h-4 w-4" aria-hidden />
                  )}
                  Print
                </button>
                <button type="button" className={toolbarButton} disabled={busy || props.pdfBusy != null} onClick={props.onDownload}>
                  {props.pdfBusy === "download" ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden />
                  )}
                  Download
                </button>
                {canShare ? (
                  <button type="button" className={toolbarButton} disabled={busy} onClick={props.onShare}>
                    <Share2 className="h-4 w-4" aria-hidden />
                    Share
                  </button>
                ) : null}
              </>
            ) : null}
            {props.addToAlbum ? (
              <AddToAlbumMenu
                className={toolbarButton}
                albums={props.addToAlbum.albums}
                currentAlbumId={props.addToAlbum.currentAlbumId}
                disabled={busy}
                onAdd={props.addToAlbum.onAdd}
              />
            ) : null}
          </div>
        ) : null}

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
                  aria-label="Full screen"
                  title="Full screen"
                  onClick={() => setFullScreen(true)}
                >
                  <Maximize2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : null}
            <div
              className="relative min-h-0 flex-1 touch-pan-y overflow-hidden rounded-xl bg-v2-bg-subtle"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (swipeRef.current = null)}
              onDoubleClick={() => hasPage && setFullScreen(true)}
            >
              {state === "drawing" && !hasPage ? (
                <V2SheetGeneratingPlaceholder imageSrc={photoSrc} imageAlt="Your photo being drawn" className="absolute inset-0 h-full w-full" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
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
              {state === "drawing" && hasPage && !photo.correcting ? (
                reshaping ? (
                  <V2WorkingOverlay
                    variant="portrait"
                    captions="reshape"
                    label={`Drawing a ${reshaping} version of this page.`}
                  />
                ) : (
                  <V2WorkingOverlay variant="edit" label="Drawing a new version of this page." />
                )
              ) : null}
              {state === "queued" && hasPage ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 p-4 backdrop-blur-[2px]">
                  <div
                    role="status"
                    className="flex max-w-xs flex-col items-center gap-1.5 rounded-2xl bg-white px-5 py-4 text-center shadow-lg shadow-v2-navy/10"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
                      <Clock className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="text-base font-semibold text-v2-ink">Waiting in line</p>
                    <p className="text-sm text-v2-muted">
                      {reshaping
                        ? `Your ${reshaping} page starts as soon as a spot opens.`
                        : "Your new version starts as soon as a spot opens."}
                      {aheadText ? ` ${aheadText.charAt(0).toUpperCase()}${aheadText.slice(1)}.` : null}
                    </p>
                  </div>
                </div>
              ) : null}
              {!hasPage && state !== "drawing" ? (
                <div className="absolute inset-x-3 bottom-3 flex flex-col items-center gap-2 rounded-2xl bg-white/95 p-3 text-center shadow-lg">
                  {state === "queued" ? (
                    <p role="status" className="flex items-center gap-2 text-sm font-semibold text-v2-muted">
                      <Clock className="h-4 w-4" aria-hidden />
                      Waiting in line{aheadText ? ` · ${aheadText}` : "…"}
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
                <span>Saved as a new version.</span>
                <button type="button" className="min-h-9 rounded-full px-3 font-semibold underline-offset-2 hover:underline" onClick={props.onUndo}>
                  Undo
                </button>
              </div>
            ) : null}
            {pages.length > 1 ? (
              <V2SheetRevisionStrip
                variant="compact"
                className="mt-2 shrink-0"
                revisions={pages}
                activeRevisionId={pageVersion?.id ?? null}
                onSelect={props.onSelectRevision}
                disabled={busy}
              />
            ) : null}
          </div>

          {/* Tools: a control panel of grouped cards */}
          <div className="shrink-0 space-y-4 border-t border-gray-100 bg-v2-bg-subtle/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
            {hasPage ? (
              <section aria-labelledby="quick-fixes">
                <h3 id="quick-fixes" className={panelHeading}>
                  Quick fixes
                </h3>
                <div className={cn(panelCard, "flex divide-x divide-gray-100")}>
                  <button type="button" className={fixTile} disabled={fixDisabled} onClick={() => props.onQuickFix("flip")}>
                    <FlipHorizontal2 className="h-4 w-4" aria-hidden />
                    Flip
                  </button>
                  <button
                    type="button"
                    className={fixTile}
                    disabled={fixDisabled}
                    onClick={() => props.onQuickFix("rotate")}
                    title="Turns the page upside down"
                  >
                    <RotateCw className="h-4 w-4" aria-hidden />
                    Rotate
                  </button>
                </div>
              </section>
            ) : null}

            {hasPage ? (
              <section aria-labelledby="change-drawing">
                <h3 id="change-drawing" className={panelHeading}>
                  Change the drawing
                </h3>
                <div className={cn(panelCard, "divide-y divide-gray-100")}>
                  <ActionRow
                    primary
                    icon={<MessageSquareText />}
                    label="Describe a change"
                    detail={editCostLabel}
                    disabled={busy}
                    onClick={props.onEditWithNote}
                  />
                  <ActionRow
                    icon={state === "drawing" && !reshaping ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <RefreshCw />}
                    label="Draw it again"
                    detail={makeCostLabel}
                    disabled={busy || state === "queued"}
                    onClick={props.onDrawAgain}
                  />
                  {shapeRow}
                </div>
              </section>
            ) : null}

            {!hasPage && props.shape ? <div className={panelCard}>{shapeRow}</div> : null}

            <section aria-labelledby="more-actions">
              <h3 id="more-actions" className={cn(panelHeading, "hidden lg:block")}>
                More
              </h3>
              <button
                type="button"
                className="mb-2 inline-flex min-h-11 w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 text-sm font-semibold text-v2-navy shadow-sm lg:hidden"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
              >
                More
                <ChevronDown className={cn("h-4 w-4 transition", moreOpen && "rotate-180")} aria-hidden />
              </button>
              <div className={cn(moreOpen ? "block" : "hidden lg:block")}>{otherActions}</div>
            </section>
          </div>
        </div>
      </div>
      {fullScreen && hasPage ? (
        <FullScreenImage
          src={shownSrc}
          alt={view === "page" ? "Coloring page" : "Your photo"}
          onClose={() => setFullScreen(false)}
        />
      ) : null}
    </div>
  );
}

/** The page or photo alone, filling the screen. X, Esc, a tap anywhere or Back closes it. */
function FullScreenImage({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalLayer({ panelRef, onClose });
  useLayerHistory(true, onClose);
  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/95 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] focus:outline-none sm:p-6"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="max-h-full max-w-full select-none rounded-lg bg-white object-contain" />
      <button
        type="button"
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Exit full screen"
        onClick={onClose}
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
