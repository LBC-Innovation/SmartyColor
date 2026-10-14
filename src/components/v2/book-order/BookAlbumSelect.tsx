"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";
import type { V2ProjectMeta } from "@/lib/v2/studioTypes";
import { cn } from "@/lib/cn";

type Props = {
  projects: V2ProjectMeta[];
  /** Coloring-sheet count per project id; undefined while still counting. */
  sheetCounts: Record<string, number>;
  selectedIds: string[];
  onToggle: (projectId: string) => void;
  loading?: boolean;
  className?: string;
};

function Switch({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
        on ? "border-v2-primary bg-v2-primary" : "border-gray-300 bg-gray-200",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform",
          on ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </span>
  );
}

/** Multi-select dropdown of albums; each row has an include/exclude toggle. */
export function BookAlbumSelect({
  projects,
  sheetCounts,
  selectedIds,
  onToggle,
  loading,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = projects.filter((p) => selectedIds.includes(p.id));
  const selectedPages = selected.reduce((sum, p) => sum + (sheetCounts[p.id] ?? 0), 0);

  const summary = loading
    ? "Loading albums…"
    : projects.length === 0
      ? "No albums yet"
      : selected.length === 0
        ? "Choose albums"
        : selected.length === 1
          ? selected[0].name
          : `${selected.length} albums`;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={loading || projects.length === 0}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="flex h-12 w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 text-left transition hover:border-v2-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <FolderOpen className="h-5 w-5 shrink-0 text-v2-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-v2-ink">{summary}</span>
          {selected.length > 0 ? (
            <span className="block text-xs text-v2-muted tabular-nums">
              {selectedPages} coloring page{selectedPages === 1 ? "" : "s"}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-v2-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-label="Albums"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-v2-surface p-1 shadow-[0_12px_32px_rgb(10_16_26/0.14)]"
        >
          {projects.map((project) => {
            const on = selectedIds.includes(project.id);
            const sheets = sheetCounts[project.id];
            const empty = sheets === 0;
            // An album with no coloring sheets adds nothing to the book; one already on can still be turned off.
            const unavailable = empty && !on;
            return (
              <li key={project.id} role="option" aria-selected={on} aria-disabled={unavailable}>
                <button
                  type="button"
                  disabled={unavailable}
                  onClick={() => onToggle(project.id)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55",
                    on ? "bg-v2-primary-light/70" : "hover:bg-v2-bg-subtle disabled:hover:bg-transparent",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold",
                        on ? "text-v2-link" : "text-v2-ink",
                      )}
                    >
                      {project.name}
                    </span>
                    <span className="block text-xs text-v2-muted tabular-nums">
                      {sheets == null
                        ? "Counting…"
                        : empty
                          ? "No coloring sheets yet"
                          : `${sheets} coloring page${sheets === 1 ? "" : "s"} · ${project.photoCount} photo${project.photoCount === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  <Switch on={on} label={`Include ${project.name}`} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
