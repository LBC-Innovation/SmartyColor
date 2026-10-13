"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { StoryPrintArtMode, V2GeneratedStory } from "@/lib/v2/storybookTypes";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";

type V2StoryModeReaderProps = {
  story: V2GeneratedStory;
  photos: V2PhotoEntry[];
  printArtMode: StoryPrintArtMode;
  pageIndex: number;
  onPageIndexChange: (index: number) => void;
  getArt: (photo: V2PhotoEntry) => string | null;
  ensureArt: (photo: V2PhotoEntry) => Promise<string>;
};

const ART_LABEL: Record<StoryPrintArtMode, string> = {
  photos: "Original photo",
  coloring: "Coloring page",
  blended: "Blended photo + lines",
};

const SWIPE_MIN_PX = 48;

/** Page-at-a-time reader: swipe or arrow keys on the pages, prefetches the next page's art. */
export function V2StoryModeReader({
  story,
  photos,
  printArtMode,
  pageIndex,
  onPageIndexChange,
  getArt,
  ensureArt,
}: V2StoryModeReaderProps) {
  const totalPages = story.pages.length + 2;
  const page = Math.min(Math.max(pageIndex, 0), totalPages - 1);
  const isIntro = page === 0;
  const isClosing = page === totalPages - 1;
  const storyPage = !isIntro && !isClosing ? story.pages[page - 1] : null;
  const photo = storyPage ? photos.find((p) => p.id === storyPage.photoId) ?? null : null;
  const nextStoryPage = page < totalPages - 2 ? story.pages[page] : null;
  const nextPhoto = nextStoryPage
    ? photos.find((p) => p.id === nextStoryPage.photoId) ?? null
    : null;
  const artSrc = photo ? getArt(photo) : null;
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (photo && !getArt(photo)) void ensureArt(photo).catch(() => undefined);
    if (nextPhoto && !getArt(nextPhoto)) void ensureArt(nextPhoto).catch(() => undefined);
  }, [photo, nextPhoto, getArt, ensureArt]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft" && page > 0) onPageIndexChange(page - 1);
      if (event.key === "ArrowRight" && page < totalPages - 1) onPageIndexChange(page + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [page, totalPages, onPageIndexChange]);

  const bodyText = isIntro
    ? story.introduction
    : isClosing
      ? story.closing
      : storyPage?.text ?? "";

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        const touch = event.changedTouches[0];
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx)) return;
        if (dx < 0 && page < totalPages - 1) onPageIndexChange(page + 1);
        if (dx > 0 && page > 0) onPageIndexChange(page - 1);
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-v2-muted">
            Story mode
          </p>
          <h3 className="v2-brand-title truncate text-lg text-v2-ink">{story.title}</h3>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-v2-muted">
          Page {page + 1} of {totalPages}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row md:items-stretch">
        {storyPage ? (
          <div className="flex w-full items-center justify-center rounded-xl bg-v2-bg-subtle p-3 md:w-1/2">
            {artSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artSrc}
                alt=""
                className="max-h-[min(42dvh,420px)] w-full rounded-lg object-contain md:max-h-[min(50dvh,480px)]"
              />
            ) : (
              <div className="flex h-40 items-center justify-center gap-2 text-sm text-v2-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {photo ? "Preparing art…" : "This photo is no longer in the album."}
              </div>
            )}
          </div>
        ) : null}

        <div className={cn("flex w-full flex-col justify-center", storyPage && "md:w-1/2")}>
          {isIntro || isClosing ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-v2-primary">
              {isIntro ? "Beginning" : "The end"}
            </p>
          ) : null}
          <p className="text-base leading-relaxed text-v2-ink md:text-lg">{bodyText}</p>
          {storyPage ? (
            <p className="mt-3 text-xs text-v2-muted">Art: {ART_LABEL[printArtMode]}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPageIndexChange(page - 1)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-v2-link hover:bg-v2-bg-subtle disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageIndexChange(page + 1)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-v2-link hover:bg-v2-bg-subtle disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
