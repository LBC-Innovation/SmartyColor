"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Corner = "tl" | "tr" | "bl" | "br";
type Box = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };
type Size = { w: number; h: number };
type Sample = { t: number; x: number; y: number };

/** Gap between the card and the edges of the conversation. */
const INSET = 12;
/** White frame around the line art. */
const PAD = 4;
const MIN_W = 112;
const MAX_W = 150;
/** Tablets: from this conversation width the card may grow to TABLET_MAX_W. */
const TABLET_FROM_W = 600;
const TABLET_MAX_W = 240;
/** Below this conversation height (keyboard up on a small phone) the card hides itself. */
const MIN_BOUNDS_H = 160;
/** Share of the conversation's width the card takes before the clamps. */
const WIDTH_SHARE = 0.34;
/** The card never takes more than this share of the conversation's height (keyboard up). */
const MAX_HEIGHT_SHARE = 0.45;
/** Below both of these it's a tap, not a drag. */
const TAP_SLOP_PX = 6;
const TAP_MAX_MS = 300;
/** How far ahead a flick is projected when picking the corner. */
const FLICK_PROJECT_MS = 200;
/** Only the last bit of the gesture counts for the release velocity. */
const VELOCITY_WINDOW_MS = 100;
/** A finger that rested this long before lifting has no flick. */
const VELOCITY_STALE_MS = 60;
/** Matches the snap transition below, plus a little slack. */
const SNAP_MS = 280;
const UPDATED_PILL_MS = 4000;

export type EditChatPipHandle = { focus: () => void };

type EditChatPipProps = {
  /** The coloring page (always the sheet, never the photo). */
  src: string;
  busy?: boolean;
  /** The conversation list: the card floats over it and never leaves its box. */
  boundsRef: RefObject<HTMLElement | null>;
  /** A tap (or Enter/Space) asks for the full-screen viewer; the card's on-screen box is passed along. */
  onOpen: (from: DOMRect) => void;
};

/** The card's outer size for a page of this aspect ratio inside this box. */
function cardSize(bounds: Box, aspect: number): Size {
  const maxW = bounds.w >= TABLET_FROM_W ? Math.min(bounds.w * WIDTH_SHARE, TABLET_MAX_W) : MAX_W;
  let w = Math.min(maxW, Math.max(MIN_W, bounds.w * WIDTH_SHARE), bounds.w - INSET * 2);
  let h = (w - PAD * 2) / aspect + PAD * 2;
  const maxH = Math.max(PAD * 2 + 24, bounds.h * MAX_HEIGHT_SHARE);
  if (h > maxH) {
    h = maxH;
    w = (h - PAD * 2) * aspect + PAD * 2;
  }
  return { w: Math.max(0, Math.round(w)), h: Math.max(0, Math.round(h)) };
}

/** Whole pixels keep the line art crisp. */
function translate(p: Point): string {
  return `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Release velocity in px/ms from the samples of the last VELOCITY_WINDOW_MS only. */
function releaseVelocity(samples: Sample[], now: number): Point {
  const recent = samples.filter((sample) => now - sample.t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return { x: 0, y: 0 };
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0 || now - last.t > VELOCITY_STALE_MS) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

function cornerPoint(corner: Corner, bounds: Box, size: Size): Point {
  const left = bounds.x + INSET;
  const right = bounds.x + bounds.w - size.w - INSET;
  const top = bounds.y + INSET;
  const bottom = bounds.y + bounds.h - size.h - INSET;
  return {
    x: corner === "tl" || corner === "bl" ? left : Math.max(left, right),
    y: corner === "tl" || corner === "tr" ? top : Math.max(top, bottom),
  };
}

function clampToBounds(p: Point, bounds: Box, size: Size): Point {
  const minX = bounds.x + INSET;
  const minY = bounds.y + INSET;
  const maxX = Math.max(minX, bounds.x + bounds.w - size.w - INSET);
  const maxY = Math.max(minY, bounds.y + bounds.h - size.h - INSET);
  return { x: Math.min(maxX, Math.max(minX, p.x)), y: Math.min(maxY, Math.max(minY, p.y)) };
}

function nearestCorner(p: Point, bounds: Box, size: Size): Corner {
  let best: Corner = "tr";
  let bestDist = Infinity;
  for (const corner of ["tl", "tr", "bl", "br"] as const) {
    const c = cornerPoint(corner, bounds, size);
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < bestDist) {
      best = corner;
      bestDist = d;
    }
  }
  return best;
}

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  /** Where the card actually was at touch-down (it may have been mid-snap). */
  origin: Point;
  moved: boolean;
  samples: Sample[];
};

function capture(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // The pointer is already gone (e.g. cancelled by the browser); dragging just won't capture.
  }
}

function release(el: Element, pointerId: number) {
  try {
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  } catch {
    // Already released.
  }
}

/**
 * Phones only: the coloring page as a small card floating over the conversation, like a video
 * call's picture-in-picture. Drag or flick it to any corner; tap it to see the page full screen.
 * Positioned by transform inside the chat column (which must be `relative` on phones), and kept
 * inside the conversation's box as it resizes (keyboard, rotation), holding its corner. Hides
 * itself when the conversation gets too short to share with it.
 */
export const EditChatPip = forwardRef<EditChatPipHandle, EditChatPipProps>(function EditChatPip(
  { src, busy = false, boundsRef, onOpen },
  ref,
) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => buttonRef.current?.focus({ preventScroll: true }) }), []);

  const [bounds, setBounds] = useState<Box | null>(null);
  const [corner, setCorner] = useState<Corner>("tr");
  const [aspect, setAspect] = useState(3 / 4);
  const [dragging, setDragging] = useState(false);
  /** Only a release after a drag animates; resizes, the keyboard and rotation move it instantly. */
  const [settling, setSettling] = useState(false);
  // While dragging, the position lives here and is written straight to the card on each move, so a
  // drag never re-renders React. React leaves the transform alone while dragging.
  const dragPos = useRef<Point>({ x: 0, y: 0 });
  const gesture = useRef<Gesture | null>(null);
  /** The pointer-up that ended a drag also fires a click; it mustn't open the viewer. */
  const swallowClick = useRef(false);
  /** Latest box and size for pointer handlers, so a resize mid-drag isn't missed. */
  const live = useRef<{ bounds: Box; size: Size } | null>(null);

  // Track the conversation's box: measured before the first paint, then on every resize.
  useLayoutEffect(() => {
    const el = boundsRef.current;
    if (!el) return;
    const measure = () => {
      const next = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      setBounds((prev) =>
        prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, [boundsRef]);

  // "Updated": when a running edit finishes and the page changed, say so on the card for a moment.
  const [busySrc, setBusySrc] = useState<string | null>(busy ? src : null);
  const [updated, setUpdated] = useState(0);
  if (busy && busySrc === null) setBusySrc(src);
  if (!busy && busySrc !== null) {
    setBusySrc(null);
    if (busySrc !== src) setUpdated((n) => n + 1);
  }
  const [pillFor, setPillFor] = useState(0);
  const showPill = updated > 0 && pillFor !== updated;
  useEffect(() => {
    if (updated === 0) return;
    const timer = window.setTimeout(() => setPillFor(updated), UPDATED_PILL_MS);
    return () => window.clearTimeout(timer);
  }, [updated]);

  // A little pop on every update, replayed even for back-to-back edits.
  useEffect(() => {
    if (updated === 0 || prefersReducedMotion()) return;
    frameRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)", offset: 0.35 }, { transform: "scale(1)" }], {
      duration: 420,
      easing: "cubic-bezier(.2,.8,.2,1)",
    });
  }, [updated]);

  useEffect(() => {
    if (!settling) return;
    const timer = window.setTimeout(() => setSettling(false), SNAP_MS + 40);
    return () => window.clearTimeout(timer);
  }, [settling]);

  const hidden = !bounds || bounds.w <= 0 || bounds.h < MIN_BOUNDS_H;
  const size = bounds ? cardSize(bounds, aspect) : null;

  useLayoutEffect(() => {
    live.current = bounds && size ? { bounds, size } : null;
  });

  // The render that starts a drag drops the transform from React's style; put the finger's spot back
  // before the frame paints.
  useLayoutEffect(() => {
    if (!dragging) return;
    const el = buttonRef.current;
    if (el) el.style.transform = translate(dragPos.current);
  }, [dragging]);

  if (hidden || !bounds || !size) return null;
  const rest = cornerPoint(corner, bounds, size);

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0) || !live.current) return;
    swallowClick.current = false;
    const button = event.currentTarget;
    capture(button, event.pointerId);
    // Start from where the card is on screen right now, even halfway through a snap.
    let origin = cornerPoint(corner, live.current.bounds, live.current.size);
    const parent = button.offsetParent;
    if (parent instanceof HTMLElement) {
      const r = button.getBoundingClientRect();
      const pr = parent.getBoundingClientRect();
      origin = { x: r.left - pr.left - parent.clientLeft, y: r.top - pr.top - parent.clientTop };
    }
    const now = performance.now();
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: now,
      origin,
      moved: false,
      samples: [{ t: now, x: event.clientX, y: event.clientY }],
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    const box = live.current;
    if (!g || g.pointerId !== event.pointerId || !box) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < TAP_SLOP_PX) return;
      g.moved = true;
      setSettling(false);
      setDragging(true);
    }
    const now = performance.now();
    g.samples.push({ t: now, x: event.clientX, y: event.clientY });
    while (g.samples.length > 2 && now - g.samples[0].t > VELOCITY_WINDOW_MS) g.samples.shift();
    dragPos.current = clampToBounds({ x: g.origin.x + dx, y: g.origin.y + dy }, box.bounds, box.size);
    const el = buttonRef.current;
    if (el) el.style.transform = translate(dragPos.current);
  }

  function finish(event: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    release(event.currentTarget, event.pointerId);
    const now = performance.now();
    const isTap = !cancelled && !g.moved && now - g.startTime < TAP_MAX_MS;
    // Anything but a quick tap (a drag, a long press) must not open the viewer.
    swallowClick.current = !isTap;
    const box = live.current;
    if (!g.moved || !box) return;

    const v = cancelled ? { x: 0, y: 0 } : releaseVelocity(g.samples, now);
    const at = dragPos.current;
    const projected = { x: at.x + v.x * FLICK_PROJECT_MS, y: at.y + v.y * FLICK_PROJECT_MS };
    setCorner(nearestCorner(projected, box.bounds, box.size));
    setSettling(true);
    setDragging(false);
  }

  const label = busy
    ? "Coloring page, updating. Show full screen"
    : showPill
      ? "Coloring page, updated. Show full screen"
      : "Show the coloring page full screen";

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      onClick={(event) => {
        // event.detail is 0 for Enter/Space: the keyboard always opens it.
        if (swallowClick.current && event.detail !== 0) {
          swallowClick.current = false;
          return;
        }
        onOpen(event.currentTarget.getBoundingClientRect());
      }}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        width: size.w,
        height: size.h,
        transform: dragging ? undefined : translate(rest),
        touchAction: "none",
        WebkitTouchCallout: "none",
      }}
      className={cn(
        "absolute left-0 top-0 z-10 cursor-grab select-none rounded-2xl will-change-transform focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary lg:hidden",
        dragging && "cursor-grabbing",
        settling && !dragging
          ? "transition-transform duration-[280ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
          : "transition-none",
      )}
    >
      <span
        ref={frameRef}
        className={cn(
          "relative block h-full w-full overflow-hidden rounded-2xl bg-white p-1 ring-1 ring-v2-primary/15 transition-shadow",
          dragging
            ? "shadow-[0_18px_40px_-10px_rgb(36_26_77/0.45)]"
            : "shadow-[0_10px_28px_-8px_rgb(36_26_77/0.35)]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) setAspect(naturalWidth / naturalHeight);
          }}
          className={cn(
            "pointer-events-none h-full w-full rounded-xl object-contain transition-opacity duration-300",
            busy && "opacity-40",
          )}
        />
        {busy ? (
          <span aria-hidden className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-md shadow-v2-navy/10">
              <Loader2 className="h-5 w-5 animate-spin text-v2-primary" />
            </span>
          </span>
        ) : null}
      </span>
      {busy ? <span aria-hidden className="v2-pip-busy pointer-events-none absolute inset-0 rounded-2xl" /> : null}
      {showPill ? (
        <span
          key={updated}
          aria-hidden
          className="v2-pip-pill pointer-events-none absolute -bottom-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-v2-primary px-2.5 py-1 text-[11px] font-semibold leading-none text-white shadow-md shadow-v2-primary/30"
        >
          <Check className="h-3 w-3" strokeWidth={3} />
          Updated
        </span>
      ) : null}
    </button>
  );
});
