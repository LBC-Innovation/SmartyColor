"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type BookOrderStep = "book" | "pages" | "cover" | "proof" | "review";

export const BOOK_ORDER_STEP_LABEL: Record<BookOrderStep, string> = {
  book: "Book",
  pages: "Pages",
  cover: "Cover",
  proof: "Check",
  review: "Checkout",
};

export function BookOrderStepper({
  steps,
  current,
  canOpen,
  onSelect,
}: {
  steps: BookOrderStep[];
  current: BookOrderStep;
  /** Steps the customer may jump to right now; the rest are shown but not clickable. */
  canOpen?: (step: BookOrderStep) => boolean;
  onSelect?: (step: BookOrderStep) => void;
}) {
  const currentIndex = steps.indexOf(current);

  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Order progress">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const openable = !active && Boolean(onSelect) && (canOpen?.(step) ?? false);
        return (
          <li key={step} className="flex items-center gap-1.5 sm:gap-2">
            {i > 0 ? (
              <span
                className={cn("h-px w-4 sm:w-6", done || active ? "bg-v2-primary" : "bg-gray-200")}
                aria-hidden
              />
            ) : null}
            <button
              type="button"
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full pl-1 pr-1 text-xs font-semibold transition md:pr-2.5",
                active && "pr-2.5",
                active && "bg-v2-primary-light text-v2-link",
                done && "text-v2-navy",
                !active && !done && "text-v2-muted",
                openable && "cursor-pointer hover:bg-v2-bg-subtle hover:text-v2-ink",
                !active && !openable && "cursor-default",
              )}
              aria-current={active ? "step" : undefined}
              aria-disabled={!active && !openable ? true : undefined}
              title={active ? undefined : openable ? `Go to ${BOOK_ORDER_STEP_LABEL[step]}` : "Finish the steps before this one first"}
              onClick={() => {
                if (openable) onSelect?.(step);
              }}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                  active && "bg-v2-primary text-white",
                  done && "bg-v2-primary/15 text-v2-primary",
                  !active && !done && "bg-gray-100",
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              {/* Five steps don't fit a phone: only the current one keeps its name there. */}
              <span className={cn(!active && "hidden md:inline")}>{BOOK_ORDER_STEP_LABEL[step]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
