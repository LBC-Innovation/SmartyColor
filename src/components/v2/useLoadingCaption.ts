"use client";

import { useEffect, useState } from "react";

/** Playful lines shown while the studio works. No timers, no "this takes a minute". */
export const LOADING_CAPTIONS = {
  sheet: [
    "Sharpening the pencils…",
    "Tracing every smile…",
    "Finding the outlines…",
    "Leaving room for your colors…",
    "Sketching the background…",
    "Erasing stray lines…",
    "Checking the little details…",
    "Inking the best bits…",
    "Making the lines nice and bold…",
    "Saving the fun parts for you…",
  ],
  edit: [
    "Grabbing the eraser…",
    "Redrawing just that part…",
    "Keeping everything else the same…",
    "Smoothing the new lines…",
    "Matching the line thickness…",
    "Brushing away the crumbs…",
  ],
  portrait: [
    "Turning the page sideways…",
    "Making room above and below…",
    "Painting in a little more sky…",
    "Keeping everyone in the picture…",
    "Blending the edges…",
    "Straightening the frame…",
  ],
} as const;

export type LoadingCaptionSet = keyof typeof LOADING_CAPTIONS;

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Cycles through a shuffled caption set. Returns the current line and a key
 * that changes with it, for a cross-fade.
 */
export function useLoadingCaption(set: LoadingCaptionSet, intervalMs = 3200) {
  const [order] = useState(() => shuffled(LOADING_CAPTIONS[set]));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % order.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [order.length, intervalMs]);

  return { caption: order[index], key: index };
}
