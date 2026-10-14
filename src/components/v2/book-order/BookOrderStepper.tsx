"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type BookOrderStep = "book" | "pages" | "cover" | "proof" | "review";

const LABEL: Record<BookOrderStep, string> = {
  book: "Book",
  pages: "Pages",
  cover: "Cover",
  proof: "Check",
  review: "Checkout",
};

export function BookOrderStepper({
  steps,
  current,
}: {
  steps: BookOrderStep[];
  current: BookOrderStep;
}) {
  const currentIndex = steps.indexOf(current);

  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Order progress">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step} className="flex items-center gap-1.5 sm:gap-2">
            {i > 0 ? (
              <span
                className={cn("h-px w-4 sm:w-6", done || active ? "bg-v2-primary" : "bg-gray-200")}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full pl-1 pr-1 text-xs font-semibold md:pr-2.5",
                active && "pr-2.5",
                active && "bg-v2-primary-light text-v2-link",
                done && "text-v2-navy",
                !active && !done && "text-v2-muted",
              )}
              aria-current={active ? "step" : undefined}
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
              <span className={cn(!active && "hidden md:inline")}>{LABEL[step]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
