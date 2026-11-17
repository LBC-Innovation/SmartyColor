"use client";

import { useEffect, useState, type RefObject } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";

/** Shown once the visitor is this many screen heights down the page. */
const SHOW_AFTER_SCREENS = 1.5;
/** Gap kept between the button and the screen edge or whatever sits under it. */
const GAP_PX = 16;

/**
 * Round "back to top" button in the lower right, shown once the page has been scrolled well past
 * the hero. On desktop the landing page scrolls inside `containerRef`; on a phone the window
 * scrolls. Both are watched, and whichever moved is the one taken back to the top.
 *
 * Bottom bars that would cover it (the phone's sticky button, the holiday toast) carry
 * `data-fab-avoid`; the button sits just above whichever of them is showing in its corner.
 */
export function ScrollToTopButton({
  containerRef,
  focusId,
  label = "Back to top",
}: {
  containerRef: RefObject<HTMLElement | null>;
  /** Element that gets focus after the jump, so keyboard users don't lose their place. */
  focusId?: string;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [lift, setLift] = useState(GAP_PX);

  useEffect(() => {
    const box = containerRef.current;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const scrolled = Math.max(window.scrollY, box?.scrollTop ?? 0);
      setVisible(scrolled > window.innerHeight * SHOW_AFTER_SCREENS);

      // Anything showing along the bottom that reaches the right-hand corner pushes the button up.
      let offset = 0;
      for (const el of document.querySelectorAll<HTMLElement>("[data-fab-avoid]")) {
        const r = el.getBoundingClientRect();
        const showing = r.height > 0 && r.top < window.innerHeight && getComputedStyle(el).visibility !== "hidden";
        if (showing && r.right > window.innerWidth - 96) offset = Math.max(offset, window.innerHeight - r.top);
      }
      setLift(offset + GAP_PX);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    box?.addEventListener("scroll", schedule, { passive: true });
    // The toast opens and closes, and the sticky bar slides, without any scrolling.
    const observer = new MutationObserver(() => {
      schedule();
      window.setTimeout(schedule, 250); // again once a slide-in transition has finished
    });
    if (box) observer.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      box?.removeEventListener("scroll", schedule);
      observer.disconnect();
    };
  }, [containerRef]);

  const toTop = () => {
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    // Focus first: moving focus after a smooth scroll has started cancels it in Chrome.
    const target = focusId ? document.getElementById(focusId) : null;
    if (target) {
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
    const box = containerRef.current;
    if (box && box.scrollTop > 0) box.scrollTo({ top: 0, behavior });
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label={label}
      title={label}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      style={{ bottom: `calc(${lift}px + env(safe-area-inset-bottom))` }}
      className={cn(
        "fixed right-4 z-[60] inline-flex h-12 w-12 items-center justify-center rounded-full bg-v2-primary text-white shadow-[0_10px_28px_rgb(36_26_77/0.35)] transition-[opacity,transform,bottom] duration-200 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary motion-reduce:transition-none sm:right-6",
        visible ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <ArrowUp className="h-5 w-5" strokeWidth={2.5} aria-hidden />
    </button>
  );
}
