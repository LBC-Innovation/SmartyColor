import { Check } from "lucide-react";
import { BOOK_PACKAGES } from "@/content/marketing";
import { cn } from "@/lib/cn";

/**
 * "Pay, add photos, order": paying for a package is not ordering the book. Shown wherever someone
 * could think they're done (the pay screen, just after paying, the empty package album), with
 * where they are now, so nobody pays and walks away thinking the book is on its way.
 * `current` is 1-based: 1 = paying, 2 = adding photos, 3 = ordering.
 */
export function BookJourney({
  current,
  compact = false,
  className,
}: {
  current: 1 | 2 | 3;
  /** One line per step, no descriptions (the empty album, where the photo step follows). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <section
      aria-label={BOOK_PACKAGES.journeyTitle}
      className={cn("rounded-2xl border border-v2-primary/20 bg-v2-primary-light/40 p-4", className)}
    >
      <p className="text-sm font-semibold text-v2-ink">{BOOK_PACKAGES.journeyTitle}</p>
      <ol className={cn("mt-3", compact ? "space-y-2" : "space-y-3")}>
        {BOOK_PACKAGES.journeySteps.map((step, i) => {
          const n = i + 1;
          const done = n < current;
          const here = n === current;
          return (
            <li key={step.title} aria-current={here ? "step" : undefined} className="flex items-start gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  done && "bg-v2-primary text-white",
                  here && "bg-v2-primary text-white ring-4 ring-v2-primary/15",
                  !done && !here && "border-2 border-gray-300 bg-white text-gray-500",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
              </span>
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={cn("font-semibold", done ? "text-v2-muted" : "text-v2-ink")}>
                    {step.title}
                    {done ? <span className="sr-only"> (done)</span> : null}
                  </span>
                  {here ? (
                    <span className="rounded-full bg-v2-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                      {BOOK_PACKAGES.journeyHere}
                    </span>
                  ) : null}
                </p>
                {compact ? null : <p className="mt-0.5 text-v2-muted">{step.body}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
