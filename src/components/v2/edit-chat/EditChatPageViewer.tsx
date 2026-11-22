"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { V2WorkingOverlay } from "@/components/v2/V2WorkingOverlay";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";

export type EditChatPreviewMode = "sheet" | "original";

/** Pull the page down this far to close. */
const SWIPE_CLOSE_PX = 80;
/** Matches .v2-viewer-out. */
const EXIT_MS = 160;

type EditChatPageViewerProps = {
  sheetImageUrl: string;
  originalPreviewUrl: string;
  previewMode: EditChatPreviewMode;
  onPreviewModeChange: (mode: EditChatPreviewMode) => void;
  busy?: boolean;
  /** Where it grows from (the floating page's centre, relative to the panel), as a CSS transform-origin. */
  transformOrigin?: string;
  /** Called once the exit animation is done; the parent unmounts it then. */
  onClose: () => void;
  /** Gets focus back once the viewer is gone (the floating page). */
  onClosed?: () => void;
};

function releaseCapture(el: Element, pointerId: number) {
  try {
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  } catch {
    // Already released.
  }
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Phones only: the coloring page (or the photo) over the whole edit dialog, opened from the
 * floating page. Its own modal layer, so Esc closes only the viewer and Tab stays inside it.
 */
export function EditChatPageViewer({
  sheetImageUrl,
  originalPreviewUrl,
  previewMode,
  onPreviewModeChange,
  busy,
  transformOrigin,
  onClose,
  onClosed,
}: EditChatPageViewerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const swipe = useRef<{ pointerId: number; startY: number; dy: number } | null>(null);

  function requestClose() {
    if (exitTimer.current !== null) return;
    if (prefersReducedMotion()) {
      exitTimer.current = 0;
      onClose();
      return;
    }
    setClosing(true);
    exitTimer.current = window.setTimeout(onClose, EXIT_MS);
  }

  useModalLayer({ panelRef, onClose: requestClose });

  // Declared after useModalLayer so this cleanup runs after it has put focus back where it was:
  // a tap doesn't focus a button on iOS, so send focus to the floating page explicitly.
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  });
  useEffect(
    () => () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
      onClosedRef.current?.();
    },
    [],
  );

  // The viewer is phones only (lg:hidden). If the window grows past that while it's open (a tablet
  // turned sideways), close it so its focus trap doesn't hold an invisible layer.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (wide.matches) onCloseRef.current();
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  function setImageOffset(dy: number, animate: boolean) {
    const el = imageRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 200ms cubic-bezier(.2,.8,.2,1), opacity 200ms" : "none";
    el.style.transform = dy ? `translateY(${dy}px)` : "";
    el.style.opacity = dy ? String(Math.max(0.4, 1 - dy / 400)) : "";
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    if (!event.isPrimary) {
      // A second finger: this is a pinch (the browser zooms), not a swipe. Let go of the swipe.
      const s = swipe.current;
      if (s) {
        swipe.current = null;
        releaseCapture(event.currentTarget, s.pointerId);
        setImageOffset(0, false);
      }
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer already gone; the swipe still works without capture.
    }
    swipe.current = { pointerId: event.pointerId, startY: event.clientY, dy: 0 };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const s = swipe.current;
    if (!s || s.pointerId !== event.pointerId) return;
    // Only downward; a little resistance so it feels attached.
    s.dy = Math.max(0, event.clientY - s.startY) * 0.85;
    setImageOffset(s.dy, false);
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const s = swipe.current;
    if (!s || s.pointerId !== event.pointerId) return;
    swipe.current = null;
    releaseCapture(event.currentTarget, event.pointerId);
    if (!cancelled && s.dy > SWIPE_CLOSE_PX) {
      requestClose();
      return;
    }
    setImageOffset(0, !prefersReducedMotion());
  }

  const showingSheet = previewMode === "sheet";
  const style: CSSProperties | undefined = transformOrigin ? { transformOrigin } : undefined;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Coloring page preview"
      tabIndex={-1}
      style={style}
      className={cn(
        "absolute inset-0 z-20 flex flex-col bg-v2-bg-subtle focus:outline-none lg:hidden",
        closing ? "v2-viewer-out" : "v2-viewer-in",
      )}
    >
      {/* Back on the left; the toggle centred in the rest. Under 380px the label shortens to "Chat". */}
      <div className="grid shrink-0 grid-cols-[auto_1fr] items-center gap-2 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={requestClose}
          aria-label="Back to chat"
          className="v2-hit inline-flex h-10 items-center gap-0.5 whitespace-nowrap rounded-full pl-1.5 pr-3 text-sm font-semibold text-v2-link transition hover:bg-white"
        >
          <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
          <span className="min-[380px]:hidden">Chat</span>
          <span className="hidden min-[380px]:inline">Back to chat</span>
        </button>
        <div
          role="group"
          aria-label="Preview"
          className="inline-flex justify-self-center whitespace-nowrap rounded-full border border-gray-200 bg-white/95 p-0.5 text-xs font-semibold shadow-sm"
        >
          {(["sheet", "original"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={previewMode === mode}
              onClick={() => onPreviewModeChange(mode)}
              className={cn(
                "v2-hit-y min-h-9 rounded-full px-3 transition",
                previewMode === mode ? "bg-v2-primary text-white" : "text-v2-muted hover:text-v2-ink",
              )}
            >
              {mode === "sheet" ? "Coloring page" : "Photo"}
            </button>
          ))}
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
        // One finger is ours (swipe down to close); two fingers still pinch-zoom.
        style={{ touchAction: "pinch-zoom" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => onPointerEnd(event, false)}
        onPointerCancel={(event) => onPointerEnd(event, true)}
      >
        <div ref={imageRef} className="relative flex h-full w-full items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={showingSheet ? sheetImageUrl : originalPreviewUrl}
            alt={showingSheet ? "Coloring page preview" : "Original photo preview"}
            draggable={false}
            className="max-h-full max-w-full select-none rounded-xl bg-white object-contain shadow-[0_10px_30px_-12px_rgb(36_26_77/0.3)]"
          />
        </div>
        {busy ? <V2WorkingOverlay variant="edit" label="Applying your edit to the coloring page." /> : null}
      </div>
    </div>
  );
}
