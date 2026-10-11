import { flushSync } from "react-dom";

type DocumentWithViewTransitions = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

/**
 * Run a state update inside a View Transition so elements that carry a
 * `view-transition-name` slide/morph between their old and new layout.
 * Falls back to a plain update where the API (or motion) isn't available.
 */
export function withViewTransition(update: () => void): void {
  if (typeof document === "undefined") {
    update();
    return;
  }
  const doc = document as DocumentWithViewTransitions;
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (typeof doc.startViewTransition !== "function" || reduceMotion) {
    update();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(update);
  });
}
