"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { MoveHorizontal } from "lucide-react";
import { HERO_COMPARE, type HeroPair } from "@/content/marketing";
import { marketingSrcSet } from "@/lib/marketing/images";

/** Displayed width of the slider's images: up to about 60% of a wide screen. */
const COMPARE_SIZES = "(min-width: 1024px) 760px, 92vw";
import { cn } from "@/lib/cn";

/** Where the divider travels during the one-time intro sweep: middle, show the page, show the photo, middle. */
function sweep(t: number): number {
  const ease = (x: number) => 0.5 - Math.cos(Math.PI * x) / 2;
  if (t < 0.3) return 50 + 38 * ease(t / 0.3);
  if (t < 0.75) return 88 - 74 * ease((t - 0.3) / 0.45);
  return 14 + 36 * ease((t - 0.75) / 0.25);
}

/**
 * The photo on the left, its coloring page on the right, and a divider you drag between them.
 * Drags by pointer anywhere on the picture (vertical swipes still scroll the page) and by arrow keys
 * through a visually hidden range input, which is also what screen readers get.
 */
export function CompareSlider({
  pair,
  className,
}: {
  pair: HeroPair;
  className?: string;
}) {
  const [pos, setPos] = useState(50);
  const touched = useRef(false);
  const dragging = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  // One slow sweep, the first time it is mostly on screen, shows that the picture is two pictures.
  // Skipped with reduced motion, and stopped the moment the visitor touches the slider.
  useEffect(() => {
    const el = box.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;
    let raf = 0;
    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        timer = window.setTimeout(() => {
          const start = performance.now();
          const tick = (now: number) => {
            if (touched.current) return;
            const t = Math.min(1, (now - start) / 2600);
            setPos(sweep(t));
            if (t < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        }, 300);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const moveTo = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPos(
      Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
    );
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    touched.current = true;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX);
  };
  const onUp = () => {
    dragging.current = false;
  };

  const img =
    "pointer-events-none absolute inset-0 block h-full w-full select-none object-cover";
  return (
    <div className={cn("relative", className)}>
      <div
        ref={box}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ aspectRatio: `${pair.width}/${pair.height}` }}
        className="relative cursor-ew-resize touch-pan-y overflow-hidden rounded-[1.75rem] border-[6px] border-white bg-white shadow-[0_24px_60px_rgb(36_26_77/0.22)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pair.photoSrc}
          srcSet={marketingSrcSet(pair.photoSrc, pair.srcSetWidths, pair.width)}
          sizes={COMPARE_SIZES}
          width={pair.width}
          height={pair.height}
          alt={pair.photoAlt}
          draggable={false}
          className={img}
          loading="lazy"
          decoding="async"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pair.sheetSrc}
          srcSet={marketingSrcSet(pair.sheetSrc, pair.srcSetWidths, pair.width)}
          sizes={COMPARE_SIZES}
          width={pair.width}
          height={pair.height}
          alt={pair.sheetAlt}
          draggable={false}
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
          className={img}
          loading="lazy"
          decoding="async"
        />

        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-v2-ink shadow-sm backdrop-blur">
          {HERO_COMPARE.photo}
        </span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-v2-primary px-2.5 py-1 text-xs font-bold text-white shadow-sm">
          {HERO_COMPARE.page}
        </span>

        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(pos)}
          aria-label={HERO_COMPARE.label}
          onChange={(e) => {
            touched.current = true;
            setPos(Number(e.target.value));
          }}
          className="peer sr-only"
        />
        <div
          className="pointer-events-none absolute inset-y-0 w-0"
          style={{ left: `${pos}%` }}
          aria-hidden
        >
          <div className="absolute inset-y-0 -left-[1.5px] w-[3px] bg-white shadow-[0_0_0_1px_rgb(36_26_77/0.12)]" />
          <span className="absolute left-0 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-v2-primary shadow-[0_6px_18px_rgb(36_26_77/0.3)] ring-4 ring-v2-primary/20">
            <MoveHorizontal className="h-5 w-5" />
          </span>
        </div>
        <span
          className="pointer-events-none absolute inset-0 rounded-[1.4rem] ring-v2-primary peer-focus-visible:ring-4"
          aria-hidden
        />
      </div>
      <p
        className="mt-3 flex items-center justify-start gap-1.5 pl-2 text-xs font-semibold text-v2-muted"
        aria-hidden
      >
        <MoveHorizontal className="h-3.5 w-3.5" />
        {HERO_COMPARE.hint}
      </p>
    </div>
  );
}
