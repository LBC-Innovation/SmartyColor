"use client";

import { cn } from "@/lib/cn";

type Props = {
  id: string;
  on: boolean;
  onChange: (on: boolean) => void;
  className?: string;
};

/** "Title on the cover" on or off. Off prints the front with pictures only. */
export function CoverTitleSwitch({ id, on, onChange, className }: Props) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span id={`${id}-label`} className="text-sm font-semibold text-v2-ink">
        Title on the cover
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!on)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
          on ? "border-v2-primary bg-v2-primary" : "border-gray-300 bg-white",
        )}
      >
        <span
          className={cn(
            "absolute h-5 w-5 rounded-full shadow-sm transition-transform motion-reduce:transition-none",
            on ? "translate-x-6 bg-white" : "translate-x-1 bg-gray-300",
          )}
        />
      </button>
    </div>
  );
}
