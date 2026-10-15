"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { BookBindingId } from "@/lib/print/bookBindings";
import {
  COVER_BLEED_IN,
  COVER_FRONT_HEIGHT_IN,
  COVER_FRONT_WIDTH_IN,
  coverFrontSafeBox,
  type BookCoverDesign,
} from "@/lib/print/bookCover";
import { drawFrontCover, type CoverRenderResult } from "@/lib/print/coverCanvas";
import { cn } from "@/lib/cn";

/** Sharp enough on a retina phone without redrawing a print-size canvas on every keystroke. */
const PREVIEW_WIDTH_PX = 1050;
/** Quick redraws (typing, color drags) finish under this, so they never flash the spinner. */
const SPINNER_DELAY_MS = 250;

type Props = {
  design: BookCoverDesign;
  sources: string[];
  bindingId: BookBindingId;
  /** Show where the printer trims and where text is safe. */
  showGuides?: boolean;
  className?: string;
  /** The pictures themselves are still on their way, so the cover isn't final yet. */
  loading?: boolean;
  onRendered?: (result: CoverRenderResult) => void;
};

const pct = (part: number, whole: number) => `${(part / whole) * 100}%`;

/** The front cover, drawn by the same code that makes the print file. */
export function BookCoverCanvas({ design, sources, bindingId, showGuides = false, className, loading = false, onRendered }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [slowDraw, setSlowDraw] = useState(false);
  const onRenderedRef = useRef(onRendered);
  useEffect(() => {
    onRenderedRef.current = onRendered;
  });

  useEffect(() => {
    const visible = canvasRef.current;
    if (!visible) return;
    let cancelled = false;
    // Draw off-screen and swap in when done, so a slow picture load never shows a half-drawn cover.
    const scratch = document.createElement("canvas");
    const slowTimer = setTimeout(() => setSlowDraw(true), SPINNER_DELAY_MS);
    drawFrontCover(scratch, { design, sources, bindingId, widthPx: PREVIEW_WIDTH_PX, fontHost: visible })
      .then((result) => {
        if (cancelled) return;
        visible.width = scratch.width;
        visible.height = scratch.height;
        visible.getContext("2d")!.drawImage(scratch, 0, 0);
        setDrawn(true);
        onRenderedRef.current?.(result);
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(slowTimer);
        if (!cancelled) setSlowDraw(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [design, sources, bindingId]);

  const busy = loading || !drawn || slowDraw;
  const safe = coverFrontSafeBox(bindingId);
  return (
    <div
      className={cn("relative overflow-hidden bg-white shadow-md", className)}
      style={{ aspectRatio: `${COVER_FRONT_WIDTH_IN} / ${COVER_FRONT_HEIGHT_IN}` }}
      aria-busy={busy}
    >
      <canvas
        ref={canvasRef}
        className={cn("block h-full w-full transition-opacity", busy && drawn && "opacity-60")}
        role="img"
        aria-label="Front cover preview"
      />
      {showGuides ? (
        <>
          <div
            className="pointer-events-none absolute border border-dashed border-red-500"
            style={{
              left: pct(COVER_BLEED_IN, COVER_FRONT_WIDTH_IN),
              right: pct(COVER_BLEED_IN, COVER_FRONT_WIDTH_IN),
              top: pct(COVER_BLEED_IN, COVER_FRONT_HEIGHT_IN),
              bottom: pct(COVER_BLEED_IN, COVER_FRONT_HEIGHT_IN),
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute border border-dotted border-sky-400"
            style={{
              left: pct(safe.x, COVER_FRONT_WIDTH_IN),
              top: pct(safe.y, COVER_FRONT_HEIGHT_IN),
              width: pct(safe.width, COVER_FRONT_WIDTH_IN),
              height: pct(safe.height, COVER_FRONT_HEIGHT_IN),
            }}
            aria-hidden
          />
        </>
      ) : null}
      {busy ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/50 backdrop-blur-[1px]"
          role="status"
        >
          <Loader2 className="h-8 w-8 animate-spin text-v2-primary" aria-hidden />
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-v2-navy shadow-sm">
            {loading ? "Loading your photos…" : "Drawing your cover…"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
