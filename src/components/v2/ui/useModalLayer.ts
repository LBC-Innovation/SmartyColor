"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Open dialogs, oldest first. Only the last one answers Esc and Tab. */
const layerStack: symbol[] = [];
let scrollLocks = 0;

/**
 * The z-index of every open dialog, oldest first. A dialog that opens while another is showing
 * (add-credit over the order review, say) stacks above it, whatever the two dialogs' own z-index
 * classes are, so it can never open hidden underneath.
 */
const zStack: { id: symbol; z: number }[] = [];

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("hidden") && el.getClientRects().length > 0,
  );
}

type Options = {
  /** The dialog box: Tab is trapped inside it, and it takes focus when nothing in it can. */
  panelRef: RefObject<HTMLElement | null>;
  /** Where to look first for the control that gets focus on open (defaults to the whole panel). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Dialogs that stay mounted while closed pass their open state. */
  active?: boolean;
  /** The dialog's usual z-index; it is raised above any dialog already open. */
  baseZ?: number;
};

/**
 * What every full-screen dialog shares: focus moves in on open and is trapped, Esc closes only the
 * topmost dialog, the page behind doesn't scroll, and on close focus goes back to where it was
 * (which may be inside the dialog underneath). Returns the z-index to put on the dialog's root, so
 * a dialog opened over another one is always drawn on top of it.
 */
export function useModalLayer({ panelRef, initialFocusRef, onClose, active = true, baseZ = 50 }: Options): {
  zIndex: number;
} {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const [zIndex, setZIndex] = useState(baseZ);
  // Layout effect: the raised z-index is in place before the dialog is first painted.
  useLayoutEffect(() => {
    if (!active) return;
    const id = Symbol("z");
    const top = zStack.length > 0 ? zStack[zStack.length - 1].z : -Infinity;
    const z = Math.max(baseZ, top + 1);
    zStack.push({ id, z });
    // Deliberate: the stack is outside React, and it has to be read as this dialog opens, before paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZIndex(z);
    return () => {
      const at = zStack.findIndex((entry) => entry.id === id);
      if (at >= 0) zStack.splice(at, 1);
    };
  }, [active, baseZ]);

  useEffect(() => {
    if (!active) return;
    const id = Symbol("dialog");
    layerStack.push(id);
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    scrollLocks += 1;
    document.body.style.overflow = "hidden";

    const first = focusablesIn(initialFocusRef?.current ?? null)[0] ?? focusablesIn(panelRef.current)[0];
    (first ?? panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (layerStack[layerStack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      const items = focusablesIn(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel?.focus();
        return;
      }
      const activeEl = document.activeElement;
      const inside = panel?.contains(activeEl) ?? false;
      if (e.shiftKey && (!inside || activeEl === items[0] || activeEl === panel)) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && (!inside || activeEl === items[items.length - 1])) {
        e.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const at = layerStack.indexOf(id);
      if (at >= 0) layerStack.splice(at, 1);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = "";
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
    // panelRef and initialFocusRef are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { zIndex };
}
