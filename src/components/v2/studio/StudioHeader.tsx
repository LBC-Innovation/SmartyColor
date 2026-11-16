"use client";

import { BookOpen, CheckSquare, Loader2, Upload, X } from "lucide-react";
import { V2ProjectSwitcher } from "@/components/v2/V2ProjectSwitcher";
import { cn } from "@/lib/cn";

type Props = {
  pageCount: number;
  photoCount: number;
  uploading: boolean;
  onAddPhotos: () => void;
  onSelectPhotos: () => void;
  selectDisabled?: boolean;
  /** Select mode is on: the Select button turns into a filled Cancel that leaves it. */
  selecting?: boolean;
  onCancelSelect?: () => void;
  /** The way into the book, always in reach while scrolling; null while the book is on screen. */
  book?: { label: string; inProgress: boolean; onOpen: () => void } | null;
};

/** One row above the gallery: album switcher, Add photos, Select photos, the book, and the page count. */
export function StudioHeader({
  pageCount,
  photoCount,
  uploading,
  onAddPhotos,
  onSelectPhotos,
  selectDisabled,
  selecting = false,
  onCancelSelect,
  book,
}: Props) {
  const btn = "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 px-3 text-sm min-[360px]:px-4 v2-btn-outline";

  return (
    <div className="flex min-h-12 items-center gap-2">
      {/* Phones: the switcher fills the row up to the buttons. sm+: fixed width, buttons right beside it. */}
      <div className="flex min-w-0 flex-1 items-center sm:flex-none">
        <V2ProjectSwitcher />
      </div>
      {(photoCount > 0 || uploading) && !selecting ? (
        <button type="button" onClick={onAddPhotos} aria-label="Add photos" className={btn}>
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          <span className="hidden min-[360px]:inline sm:hidden">Add</span>
          <span className="hidden sm:inline">Add photos</span>
        </button>
      ) : null}
      {selecting ? (
        <button
          type="button"
          onClick={onCancelSelect}
          aria-pressed="true"
          aria-label="Cancel selecting photos"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-v2-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          <X className="h-4 w-4" aria-hidden />
          Cancel
        </button>
      ) : photoCount > 0 ? (
        <button
          type="button"
          onClick={onSelectPhotos}
          disabled={selectDisabled}
          aria-pressed="false"
          aria-label="Select photos"
          title="Select photos"
          className={cn(btn, "max-sm:px-0 disabled:cursor-not-allowed disabled:opacity-50")}
        >
          <CheckSquare className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Select photos</span>
        </button>
      ) : null}
      {book ? (
        <button
          type="button"
          onClick={book.onOpen}
          aria-label={book.label}
          className="relative hidden min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-v2-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 sm:inline-flex"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{book.label}</span>
          {book.inProgress ? (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-400" aria-hidden />
          ) : null}
        </button>
      ) : null}
      {photoCount > 0 ? (
        <span className="ml-auto hidden shrink-0 text-sm text-v2-muted tabular-nums sm:inline">
          {pageCount} {pageCount === 1 ? "page" : "pages"}
        </span>
      ) : null}
    </div>
  );
}
