import { Check } from "lucide-react";
import { BOOK_PACKAGES } from "@/content/marketing";
import { cn } from "@/lib/cn";

/**
 * Where the person is in "pick a book, pay, theme, photos". `step` is 1-based. Not clickable.
 * `flow="pages"` is "Print as you go", which has no Pay step.
 */
export function WizardProgress({
  step,
  flow = "package",
  className,
}: {
  step: number;
  flow?: "package" | "pages";
  className?: string;
}) {
  const labels = flow === "pages" ? BOOK_PACKAGES.stepsPages : BOOK_PACKAGES.steps;
  return (
    <nav aria-label={BOOK_PACKAGES.stepsLabel} className={className}>
      {/* Phones: one line and a four-part bar. */}
      <div className="sm:hidden">
        <p className="text-xs font-semibold text-v2-muted">
          Step {step} of {labels.length} · {labels[step - 1]}
        </p>
        <div className="mt-1.5 flex gap-0.5" aria-hidden>
          {labels.map((label, i) => (
            <span key={label} className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-v2-primary" : "bg-gray-200")} />
          ))}
        </div>
      </div>
      {/* Wider screens: dots with labels. */}
      <ol className="hidden items-center gap-2 sm:flex">
        {labels.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          return (
            <li key={label} aria-current={current ? "step" : undefined} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                  done && "bg-v2-primary text-white",
                  current && "border-2 border-v2-primary bg-white text-v2-primary",
                  !done && !current && "border-2 border-gray-300 bg-white text-gray-400",
                )}
                aria-hidden
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
              </span>
              <span className={cn("text-xs font-semibold", current ? "text-v2-ink" : "text-v2-muted")}>
                {label}
                {done ? <span className="sr-only"> (done)</span> : null}
              </span>
              {n < labels.length ? <span className="h-px w-6 bg-gray-300" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
