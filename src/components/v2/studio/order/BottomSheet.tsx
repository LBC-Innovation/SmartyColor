"use client";

import { useRef, useState, type ReactNode } from "react";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { useLayerHistory } from "@/components/v2/studio/useLayerHistory";

/**
 * A phone bottom sheet (90% of the screen): drag the handle down or tap Close, and Back closes it.
 * Its body is a scroll container with room at the bottom, so a focused field clears the keyboard.
 */
export function BottomSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling body (the buy button). */
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { zIndex: layerZ } = useModalLayer({ baseZ: 50, panelRef, initialFocusRef: bodyRef, onClose });
  useLayerHistory(true, onClose);
  const [drag, setDrag] = useState(0);
  const startRef = useRef<{ y: number; id: number } | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ zIndex: layerZ }} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-v2-ink/40" aria-label="Close" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="cm-sheet-up relative flex h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-v2-surface shadow-2xl focus:outline-none"
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
      >
        <div
          className="flex shrink-0 touch-none cursor-grab flex-col items-center pt-2"
          onPointerDown={(e) => {
            startRef.current = { y: e.clientY, id: e.pointerId };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const start = startRef.current;
            if (!start || start.id !== e.pointerId) return;
            setDrag(Math.max(0, e.clientY - start.y));
          }}
          onPointerUp={(e) => {
            const start = startRef.current;
            startRef.current = null;
            if (!start) return;
            const moved = e.clientY - start.y;
            setDrag(0);
            if (moved > 120) onClose();
          }}
          onPointerCancel={() => {
            startRef.current = null;
            setDrag(0);
          }}
          aria-hidden
        >
          <span className="h-1.5 w-12 rounded-full bg-gray-300" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-1">
          <h2 className="v2-brand-title text-lg text-v2-ink">{title}</h2>
          <button type="button" className="min-h-11 rounded-full px-3 text-sm font-semibold text-v2-link" onClick={onClose}>
            Close
          </button>
        </div>
        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 [scroll-padding-bottom:12rem]"
          onFocusCapture={(e) => {
            const field = e.target as HTMLElement;
            if (!/^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName)) return;
            // Wait for the on-screen keyboard to open, then bring the field above it.
            window.setTimeout(() => field.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
          }}
        >
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-gray-100 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
