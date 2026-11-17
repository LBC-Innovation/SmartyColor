"use client";

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

export type ArrangeLiftInfo = {
  id: string;
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  originRect: DOMRect;
};

type Options = {
  id: string;
  onLift: (info: ArrangeLiftInfo) => void;
  disabled?: boolean;
  /** Attached to a grip handle: buttons are fine to start from, and a touch hold can be shorter. */
  fromHandle?: boolean;
  /** Element whose rect the loupe flies out of; defaults to the element the handler is on. */
  getOriginEl?: () => HTMLElement | null;
};

const INTERACTIVE = "button, a, input, [role=menu], [data-no-lift]";
const MOUSE_SLOP = 6;
const TOUCH_SLOP = 8;
const HOLD_MS = 280;
const HANDLE_HOLD_MS = 120;

/**
 * Decides when a press on a card becomes a "lift": a small drag with a mouse, or a short hold with
 * a finger (moving first means the person is scrolling). Returns the handler to spread on the card.
 */
export function useArrangeLift({ id, onLift, disabled = false, fromHandle = false, getOriginEl }: Options) {
  const latest = useRef({ id, onLift, disabled, fromHandle, getOriginEl });
  useEffect(() => {
    latest.current = { id, onLift, disabled, fromHandle, getOriginEl };
  });
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const cur = latest.current;
    if (cur.disabled || !e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget;
    if (!cur.fromHandle) {
      const hit = (e.target as Element | null)?.closest?.(INTERACTIVE);
      // The big art buttons (they open the page) are the card's main surface, so they can lift it.
      if (hit && el.contains(hit) && !hit.hasAttribute("data-lift-ok")) return;
    }
    cleanup.current?.();

    const { pointerId, pointerType } = e;
    const isMouse = pointerType === "mouse";
    const startX = e.clientX;
    const startY = e.clientY;
    let x = startX;
    let y = startY;
    let timer = 0;
    let lifted = false;
    let blockTouch: ((ev: TouchEvent) => void) | null = null;
    let blockClick: ((ev: MouseEvent) => void) | null = null;

    const stopArming = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    const finish = () => {
      stopArming();
      if (blockTouch) document.removeEventListener("touchmove", blockTouch);
      if (blockClick) {
        const fn = blockClick;
        // The click that follows a mouse drag arrives right after pointerup.
        window.setTimeout(() => document.removeEventListener("click", fn, true), 60);
      }
      cleanup.current = null;
    };

    function lift() {
      if (lifted) return;
      lifted = true;
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      if (!isMouse) {
        navigator.vibrate?.(10);
        // Non-passive so the page cannot scroll (and the browser cannot steal the pointer) mid-drag.
        blockTouch = (ev) => ev.preventDefault();
        document.addEventListener("touchmove", blockTouch, { passive: false });
      } else {
        blockClick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        document.addEventListener("click", blockClick, true);
      }
      const origin = cur.getOriginEl?.() ?? el;
      cur.onLift({ id: cur.id, pointerId, pointerType, x, y, originRect: origin.getBoundingClientRect() });
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      x = ev.clientX;
      y = ev.clientY;
      const dist = Math.hypot(x - startX, y - startY);
      if (isMouse) {
        if (dist >= MOUSE_SLOP) lift();
      } else if (dist > TOUCH_SLOP) {
        // Moved before the hold finished: that is a scroll, not a lift.
        stopArming();
        cleanup.current = null;
      }
    }

    function onEnd(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      finish();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    if (!isMouse) timer = window.setTimeout(lift, cur.fromHandle ? HANDLE_HOLD_MS : HOLD_MS);
    cleanup.current = finish;
  }, []);

  return { onPointerDown };
}
