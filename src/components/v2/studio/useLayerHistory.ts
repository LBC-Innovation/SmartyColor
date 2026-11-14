"use client";

import { useEffect, useRef } from "react";

/**
 * One history helper for every studio layer (page editor, book sheet, confirm modal), so the
 * phone's Back button closes exactly one layer at a time and never leaves /studio.
 *
 * Opening a layer pushes one history entry marked with its depth. Back lands on a shallower entry,
 * and every layer deeper than it closes. Closing a layer from the screen goes back through history
 * itself so no stray entry is left behind; a layer opened while that is still settling waits for
 * it, so the two never race.
 */
type Layer = { depth: number; pushed: boolean; close: () => void };

const open: Layer[] = [];
const waiting: Layer[] = [];
let pendingBacks = 0;
let listening = false;

function depthOf(state: unknown): number {
  const d = (state as { cmLayer?: unknown } | null)?.cmLayer;
  return typeof d === "number" ? d : 0;
}

function push(layer: Layer) {
  layer.depth = depthOf(window.history.state) + 1;
  layer.pushed = true;
  window.history.pushState({ cmLayer: layer.depth }, "", window.location.href);
}

function onPopState(event: PopStateEvent) {
  const depth = depthOf(event.state);
  for (let i = open.length - 1; i >= 0; i -= 1) {
    const layer = open[i];
    if (layer.pushed && layer.depth > depth) {
      open.splice(i, 1);
      layer.close();
    }
  }
  if (pendingBacks > 0) {
    pendingBacks -= 1;
    if (pendingBacks === 0) waiting.splice(0).forEach(push);
  }
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("popstate", onPopState);
}

export function useLayerHistory(isOpen: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    listen();
    const layer: Layer = { depth: 0, pushed: false, close: () => closeRef.current() };
    open.push(layer);
    if (pendingBacks > 0) waiting.push(layer);
    else push(layer);
    return () => {
      const queued = waiting.indexOf(layer);
      if (queued >= 0) waiting.splice(queued, 1);
      const at = open.indexOf(layer);
      if (at < 0) return; // closed by Back: history is already where it should be
      open.splice(at, 1);
      // After a navigation away (an order page, say) the entry on show is no longer ours.
      if (layer.pushed && depthOf(window.history.state) === layer.depth) {
        pendingBacks += 1;
        window.history.back();
      }
    };
  }, [isOpen]);
}
