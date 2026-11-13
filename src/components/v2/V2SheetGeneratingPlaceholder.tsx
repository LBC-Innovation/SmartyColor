"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/cn";
import { makePencilSketch, type PencilSketch } from "@/lib/v2/pencilSketch";
import { useLoadingCaption } from "@/components/v2/useLoadingCaption";

type V2SheetGeneratingPlaceholderProps = {
  imageSrc: string;
  imageAlt?: string;
  className?: string;
  imageFit?: "contain" | "cover";
  /** Smaller version for library thumbnails: no captions. */
  compact?: boolean;
};

/**
 * Loading state for a coloring page: a pencil sketches the user's own photo,
 * row by row, while playful captions rotate underneath. Nothing counts time —
 * the drawing moves quickly at first and then slows, so it always looks busy
 * and never stalls at "almost done".
 */
export function V2SheetGeneratingPlaceholder({
  imageSrc,
  imageAlt = "",
  className,
  imageFit = "contain",
  compact,
}: V2SheetGeneratingPlaceholderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pencilRef = useRef<HTMLSpanElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  // Keyed by source so a new photo never shows the previous photo's sketch.
  const sketchKey = `${imageSrc}|${compact ? "compact" : "full"}`;
  const [made, setMade] = useState<{ key: string; sketch: PencilSketch } | null>(null);
  const sketch = made?.key === sketchKey ? made.sketch : null;
  const { caption, key } = useLoadingCaption("sheet");

  useEffect(() => {
    let cancelled = false;
    if (!imageSrc) return;
    makePencilSketch(imageSrc, compact ? 420 : 720)
      .then((result) => {
        if (!cancelled) setMade({ key: `${imageSrc}|${compact ? "compact" : "full"}`, sketch: result });
      })
      .catch(() => {
        /* no sketch: the faded photo and captions still show */
      });
    return () => {
      cancelled = true;
    };
  }, [imageSrc, compact]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sketch) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = sketch.width;
    canvas.height = sketch.height;
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, sketch.width, sketch.height);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(sketch.canvas, 0, 0);
      if (photoRef.current) photoRef.current.style.opacity = "0";
      return;
    }

    const { width: w, height: h } = sketch;
    const rows = compact ? 4 : 7;
    const rowHeight = h / rows;
    const brush = rowHeight * 0.78;
    const pathLength = rows * w;
    /** Path position (0–1) → point on a loose zig-zag across the page. */
    const pointAt = (s: number) => {
      const distance = Math.min(0.99999, Math.max(0, s)) * pathLength;
      const row = Math.floor(distance / w);
      const along = distance - row * w;
      const x = row % 2 === 0 ? along : w - along;
      const wobble = Math.sin((along / w) * Math.PI * 5 + row) * rowHeight * 0.22;
      return { x, y: (row + 0.5) * rowHeight + wobble };
    };
    const stamp = (x: number, y: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, brush, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(sketch.canvas, 0, 0);
      ctx.restore();
    };

    /** Where the canvas content sits inside the element (object-fit contain/cover). */
    const placePencil = (x: number, y: number, t: number) => {
      const pencil = pencilRef.current;
      if (!pencil) return;
      const boxW = canvas.clientWidth;
      const boxH = canvas.clientHeight;
      const scale = imageFit === "cover" ? Math.max(boxW / w, boxH / h) : Math.min(boxW / w, boxH / h);
      const offsetX = (boxW - w * scale) / 2;
      const offsetY = (boxH - h * scale) / 2;
      const tilt = Math.sin(t / 180) * 8;
      pencil.style.transform = `translate(${offsetX + x * scale}px, ${offsetY + y * scale}px) translate(-15%, -85%) rotate(${tilt}deg)`;
    };

    const tau = 9000; // ~67% drawn at 10 s, ~89% at 20 s, then a slow finish
    const step = brush * 0.45;
    let drawnTo = 0;
    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const target = 1 - Math.exp(-elapsed / tau);
      while (drawnTo < target) {
        drawnTo = Math.min(target, drawnTo + step / pathLength);
        const p = pointAt(drawnTo);
        stamp(p.x, p.y);
      }
      const at = pointAt(drawnTo);
      // Once the page is mostly drawn, the pencil keeps "shading" in small loops.
      const idle = drawnTo > 0.97 ? { x: Math.cos(elapsed / 420) * brush * 0.6, y: Math.sin(elapsed / 300) * brush * 0.4 } : { x: 0, y: 0 };
      if (drawnTo > 0.97) stamp(at.x + idle.x, at.y + idle.y);
      placePencil(at.x + idle.x, at.y + idle.y, elapsed);
      if (photoRef.current) {
        photoRef.current.style.opacity = String(0.32 * (1 - Math.min(1, drawnTo * 1.15)));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sketch, compact, imageFit]);

  return (
    <div
      className={cn("v2-sketch-paper relative overflow-hidden", className)}
      aria-busy="true"
      aria-label="Drawing your coloring page"
    >
      {!compact ? (
        <span role="status" className="sr-only">
          Drawing your coloring page.
        </span>
      ) : null}

      {/* The photo, faint, fading out as the sketch covers it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={photoRef}
        src={imageSrc}
        alt={imageAlt}
        className={cn(
          "absolute inset-0 h-full w-full opacity-[0.32] grayscale",
          imageFit === "cover" ? "object-cover" : "object-contain",
        )}
      />

      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "absolute inset-0 h-full w-full mix-blend-multiply transition-opacity duration-500",
          imageFit === "cover" ? "object-cover" : "object-contain",
          sketch ? "opacity-100" : "opacity-0",
        )}
      />

      {sketch ? (
        <span
          ref={pencilRef}
          aria-hidden
          className="v2-sketch-pencil pointer-events-none absolute left-0 top-0 will-change-transform"
        >
          <Pencil
            className={cn(
              "text-v2-navy drop-shadow-[0_3px_6px_rgba(48,58,77,0.35)]",
              compact ? "h-5 w-5" : "h-9 w-9",
            )}
            strokeWidth={1.75}
            fill="#fcd34d"
          />
        </span>
      ) : null}

      {!compact ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
          <span
            key={key}
            className="v2-caption-swap rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-v2-navy shadow-md shadow-v2-navy/10 backdrop-blur-sm"
          >
            {caption}
          </span>
        </div>
      ) : null}
    </div>
  );
}
