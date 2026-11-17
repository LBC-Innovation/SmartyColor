"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

type Spot = { x: number; y: number };

const GLIDE_MS = 420;

function spotOf(el: HTMLElement): Spot {
  // Layout position, unaffected by any transform (drag or glide) on the element.
  return { x: el.offsetLeft, y: el.offsetTop };
}

/**
 * When the grid's width changes (the book panel opening or closing beside the gallery), cards
 * that jump to another row or column glide there instead of snapping. Small, continuous shifts
 * while the columns narrow are left alone: the width transition already makes those smooth.
 *
 * Animates the grid's direct children with the Web Animations API, so it doesn't touch the
 * inline transforms dnd-kit sets on the cards inside them.
 */
export function useGridGlide(gridRef: RefObject<HTMLElement | null>) {
  const spots = useRef(new Map<Element, Spot>());

  // After every render (a reorder, an upload), take the new spots as the baseline without animating.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const next = new Map<Element, Spot>();
    for (const child of Array.from(grid.children)) next.set(child, spotOf(child as HTMLElement));
    spots.current = next;
  });

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastWidth = grid.offsetWidth;

    const observer = new ResizeObserver(() => {
      const width = grid.offsetWidth;
      const widthChanged = width !== lastWidth;
      lastWidth = width;
      const next = new Map<Element, Spot>();
      for (const child of Array.from(grid.children)) {
        const el = child as HTMLElement;
        const spot = spotOf(el);
        next.set(el, spot);
        const prev = spots.current.get(el);
        if (!prev || !widthChanged || reduced.matches) continue;
        const dx = prev.x - spot.x;
        const dy = prev.y - spot.y;
        // A jump to another row, or across more than a column: worth gliding.
        if (Math.abs(dy) < el.offsetHeight / 2 && Math.abs(dx) < el.offsetWidth) continue;
        el.getAnimations().forEach((animation) => animation.cancel());
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: GLIDE_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      }
      spots.current = next;
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef]);
}
