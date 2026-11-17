"use client";

import { Check, ImageUp, PencilLine } from "lucide-react";
import { cn } from "@/lib/cn";
import type { UploadProgress } from "@/components/v2/studio/useUploadProgress";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Docked at the bottom of the screen while photos are added and their pages drawn, so it is in
 * sight wherever the gallery is scrolled: one bar for the whole run, filling smoothly, that
 * settles at 100% and slides away when everything is ready. `className` places it (bottom offset).
 */
export function UploadProgressBar({
  progress,
  onStopRest,
  className,
}: {
  progress: UploadProgress;
  /** Takes the waiting pages out of the queue; shown while some are waiting. */
  onStopRest?: () => void;
  className?: string;
}) {
  const { phase, fraction, uploads, pages } = progress;
  const percent = Math.round(fraction * 100);
  const done = phase === "done";

  const title =
    phase === "uploading"
      ? `Adding ${plural(uploads.total, "photo", "photos")}`
      : phase === "drawing"
        ? `Making ${plural(pages.total, "coloring page", "coloring pages")}`
        : pages.total > 0
          ? pages.total === 1
            ? "Your coloring page is ready"
            : "Your coloring pages are ready"
          : uploads.total === 1
            ? "Your photo is in"
            : "Your photos are in";
  const detail =
    phase === "uploading"
      ? `${uploads.done} of ${uploads.total} uploaded${pages.total > 0 ? " · pages next" : ""}`
      : phase === "drawing"
        ? `${pages.done} of ${pages.total} ready`
        : null;

  const Icon = done ? Check : phase === "uploading" ? ImageUp : PencilLine;

  return (
    <div
      role="region"
      aria-label="Upload progress"
      className={cn(
        "v2-progress-dock fixed left-1/2 z-30 -translate-x-1/2 w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-v2-primary/15 bg-v2-surface/95 px-3 py-2.5 shadow-lg shadow-v2-primary/15 backdrop-blur sm:px-4",
        done && "v2-progress-card-done",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-500 [&>svg]:h-[18px] [&>svg]:w-[18px]",
            done ? "bg-v2-primary text-white" : "v2-progress-icon bg-v2-primary-light text-v2-primary",
          )}
        >
          <Icon key={phase} className="cm-fade-in" />
        </span>
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <p className="truncate text-sm font-semibold text-v2-ink">{title}</p>
          {detail ? <p className="truncate text-xs text-v2-muted">{detail}</p> : null}
        </div>
        {onStopRest && !done ? (
          <button
            type="button"
            className="min-h-9 shrink-0 rounded-full px-2 text-sm font-semibold text-v2-link hover:underline"
            onClick={onStopRest}
          >
            Stop the rest
          </button>
        ) : null}
        <span className="shrink-0 text-sm font-semibold tabular-nums text-v2-primary" aria-hidden>
          {percent}%
        </span>
      </div>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-v2-primary-light"
        role="progressbar"
        aria-label="Upload and page progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className={cn("v2-progress-fill h-full rounded-full", !done && "v2-progress-fill-live")}
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </div>
    </div>
  );
}

