"use client";

import { useEffect, useRef } from "react";
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

type Props = {
  design: BookCoverDesign;
  sources: string[];
  bindingId: BookBindingId;
  /** Show where the printer trims and where text is safe. */
  showGuides?: boolean;
  className?: string;
  onRendered?: (result: CoverRenderResult) => void;
};

const pct = (part: number, whole: number) => `${(part / whole) * 100}%`;

/** The front cover, drawn by the same code that makes the print file. */
export function BookCoverCanvas({ design, sources, bindingId, showGuides = false, className, onRendered }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    void drawFrontCover(scratch, { design, sources, bindingId, widthPx: PREVIEW_WIDTH_PX, fontHost: visible }).then(
      (result) => {
        if (cancelled) return;
        visible.width = scratch.width;
        visible.height = scratch.height;
        visible.getContext("2d")!.drawImage(scratch, 0, 0);
        onRenderedRef.current?.(result);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [design, sources, bindingId]);

  const safe = coverFrontSafeBox(bindingId);
  return (
    <div
      className={cn("relative overflow-hidden bg-white shadow-md", className)}
      style={{ aspectRatio: `${COVER_FRONT_WIDTH_IN} / ${COVER_FRONT_HEIGHT_IN}` }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" role="img" aria-label="Front cover preview" />
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
    </div>
  );
}
