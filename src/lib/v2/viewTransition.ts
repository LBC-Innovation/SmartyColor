import { flushSync } from "react-dom";

type DocumentWithViewTransitions = Document & {
  startViewTransition?: (update: () => void) => {
    ready?: Promise<void>;
    finished?: Promise<void>;
    updateCallbackDone?: Promise<void>;
  };
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
  // A hidden tab (or a second transition) aborts the animation; the update still runs, so the
  // rejection is expected and must not surface as an unhandled error.
  if (document.visibilityState === "hidden") {
    update();
    return;
  }
  const transition = doc.startViewTransition(() => {
    flushSync(update);
  });
  const ignore = () => {};
  transition?.ready?.catch(ignore);
  transition?.finished?.catch(ignore);
  transition?.updateCallbackDone?.catch(ignore);
}
