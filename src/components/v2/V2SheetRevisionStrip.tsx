"use client";

import { cn } from "@/lib/cn";
import type { SheetVersion } from "@/lib/session/types";

type V2SheetRevisionStripProps = {
  revisions: SheetVersion[];
  activeRevisionId: string | null;
  onSelect: (revisionId: string) => void;
  disabled?: boolean;
  className?: string;
};

export function V2SheetRevisionStrip({
  revisions,
  activeRevisionId,
  onSelect,
  disabled,
  className,
}: V2SheetRevisionStripProps) {
  if (revisions.length === 0) return null;

  return (
    <div
      className={cn("flex shrink-0 flex-col gap-2", className)}
      role="listbox"
      aria-label="Coloring sheet revisions"
    >
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Revisions
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-y-contain py-0.5">
        {revisions.map((revision, index) => {
          const selected = revision.id === activeRevisionId;
          return (
            <button
              key={revision.id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => onSelect(revision.id)}
              className={cn(
                "relative shrink-0 overflow-hidden rounded-lg border-2 bg-white transition",
                selected
                  ? "border-v2-primary ring-2 ring-v2-primary/20"
                  : "border-slate-200 hover:border-indigo-200",
                disabled && "cursor-not-allowed opacity-60",
              )}
              aria-label={`Revision ${index + 1}${selected ? ", selected" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={revision.sheet.imageDataUrl}
                alt=""
                className="aspect-[3/4] h-14 w-11 object-contain object-center sm:h-16 sm:w-12"
              />
              <span
                className={cn(
                  "absolute inset-x-0 bottom-0 bg-slate-900/70 py-0.5 text-center text-[9px] font-semibold text-white",
                  selected && "bg-v2-primary/90",
                )}
              >
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
