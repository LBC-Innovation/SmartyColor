"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SheetVersion } from "@/lib/session/types";

type SheetVersionSelectProps = {
  versions: SheetVersion[];
  onSelect: (versionId: string) => void;
};

export function SheetVersionSelect({
  versions,
  onSelect,
}: SheetVersionSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const labelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (versions.length === 0) return null;

  const ordered = [...versions].reverse();

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <span
        id={labelId}
        className="font-display text-sm font-semibold text-ink"
      >
        Past drawings
      </span>

      <button
        type="button"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-card border-[3px] border-ink bg-paper pl-4 pr-5 text-left font-body text-base text-ink transition",
          "hover:bg-sky/60",
          open && "bg-sky/40",
        )}
      >
        <span className="min-w-0 truncate text-ink-soft">
          Open a previous version…
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-5 shrink-0 text-ink transition-transform",
            open ? "rotate-0" : "rotate-90",
          )}
          strokeWidth={2.5}
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className="absolute top-[calc(100%+0.35rem)] left-0 z-30 max-h-64 w-full overflow-y-auto rounded-card border-[3px] border-ink bg-paper p-2 shadow-crayon"
        >
          {ordered.map((version, index) => {
            const n = versions.length - index;
            const label = version.sheet.title?.trim() || `Drawing ${n}`;

            return (
              <li key={version.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full flex-col gap-0.5 rounded-[1.125rem] px-3.5 py-2.5 text-left transition hover:bg-sky"
                  onClick={() => {
                    onSelect(version.id);
                    setOpen(false);
                  }}
                >
                  <span className="font-display text-sm font-semibold text-ink">
                    Version {n}
                  </span>
                  <span className="truncate font-body text-base text-ink-soft">
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
