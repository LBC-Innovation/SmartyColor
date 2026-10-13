"use client";

import { Crop, ImageIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SheetVersion } from "@/lib/session/types";
import { useThumbUrl } from "@/lib/v2/thumbnail";

type V2SheetRevisionStripProps = {
  revisions: SheetVersion[];
  activeRevisionId: string | null;
  onSelect: (revisionId: string) => void;
  /** The uploaded photo, listed first so it can be recalled once it has portrait versions. */
  original?: { src: string; selected: boolean; onSelect: () => void };
  onEditSheet?: () => void;
  editDisabled?: boolean;
  disabled?: boolean;
  className?: string;
  /** Docked to the studio preview card edge */
  variant?: "sidebar" | "compact";
};

function RevisionThumb({ src }: { src: string }) {
  const thumb = useThumbUrl(src);
  if (!thumb) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumb}
      alt=""
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover object-center"
    />
  );
}

export function V2SheetRevisionStrip({
  revisions,
  activeRevisionId,
  onSelect,
  original,
  onEditSheet,
  editDisabled,
  disabled,
  className,
  variant = "sidebar",
}: V2SheetRevisionStripProps) {
  if (revisions.length === 0) return null;

  const isSidebar = variant === "sidebar";
  const tileClass = cn(
    "relative shrink-0 overflow-hidden rounded-lg border border-slate-800 bg-white transition",
    isSidebar
      ? "aspect-[3/4] w-full max-h-[5.5rem] sm:max-h-[6.25rem]"
      : "aspect-[3/4] h-14 w-11 sm:h-16 sm:w-12",
    disabled && "cursor-not-allowed opacity-60",
  );
  const selectedClass = (selected: boolean) =>
    selected ? "border-v2-primary ring-2 ring-v2-primary/20" : "hover:border-v2-primary/50";
  const badgeClass =
    "absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-white/90 text-v2-primary shadow-sm";
  const labelClass =
    "absolute inset-x-0 bottom-0 py-0.5 text-center text-[9px] font-semibold text-white";

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col",
        isSidebar
          ? "h-full min-h-0 w-[5.75rem] border-l border-gray-200 bg-v2-bg-subtle sm:w-[6.75rem] lg:w-28"
          : "flex-row items-center gap-2",
        className,
      )}
      aria-label="Photo and coloring sheet versions"
    >
      <p
        className={cn(
          "shrink-0 font-semibold uppercase tracking-wide text-v2-muted",
          isSidebar
            ? "border-b border-gray-200 px-2 py-2 text-center text-[10px] leading-tight"
            : "text-[10px] text-v2-muted",
        )}
      >
        Versions
      </p>
      {isSidebar && onEditSheet ? (
        <div className="shrink-0 border-b border-gray-200 px-2 py-2">
          <button
            type="button"
            disabled={editDisabled}
            onClick={onEditSheet}
            className="flex w-full min-h-11 flex-col items-center justify-center gap-1 rounded-xl bg-v2-primary px-1.5 py-2.5 text-center shadow-md shadow-v2-primary/25 transition hover:bg-v2-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary disabled:cursor-not-allowed disabled:bg-gray-200 disabled:shadow-none disabled:[&_svg]:text-v2-muted disabled:[&_span]:text-v2-muted"
            aria-label="Edit coloring sheet"
          >
            <Crop className="h-4 w-4 shrink-0 text-white" aria-hidden />
            <span className="text-[10px] font-bold leading-tight text-white sm:text-[11px]">
              Edit sheet
            </span>
          </button>
        </div>
      ) : null}
      <div
        role="listbox"
        aria-label="Version thumbnails"
        className={cn(
          "flex min-h-0 flex-1 gap-2 overscroll-contain",
          isSidebar
            ? "flex-col overflow-y-auto px-2 py-2"
            : "flex-row overflow-x-auto py-0.5",
        )}
      >
        {original ? (
          <button
            type="button"
            role="option"
            aria-selected={original.selected}
            disabled={disabled}
            onClick={original.onSelect}
            className={cn(tileClass, selectedClass(original.selected))}
            aria-label={`Original photo${original.selected ? ", selected" : ""}`}
            title="Original photo"
          >
            <RevisionThumb src={original.src} />
            <span className={badgeClass}>
              <ImageIcon className="h-3 w-3" aria-hidden />
            </span>
            <span className={cn(labelClass, original.selected ? "bg-v2-primary/90" : "bg-slate-900/70")}>
              Original
            </span>
          </button>
        ) : null}
        {revisions.map((revision, index) => {
          const selected = revision.id === activeRevisionId;
          const isPhoto = revision.kind === "photo";
          return (
            <button
              key={revision.id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => onSelect(revision.id)}
              className={cn(tileClass, selectedClass(selected))}
              aria-label={`Version ${index + 1}${isPhoto ? ", portrait photo" : ""}${selected ? ", selected" : ""}`}
              title={isPhoto ? "Portrait photo" : undefined}
            >
              <RevisionThumb src={revision.sheet.imageDataUrl} />
              {isPhoto ? (
                <span className={badgeClass}>
                  <ImageIcon className="h-3 w-3" aria-hidden />
                </span>
              ) : null}
              <span
                className={cn(labelClass, selected ? "bg-v2-primary/90" : "bg-slate-900/70")}
              >
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
