"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { StoryPrintArtMode, V2GeneratedStory } from "@/lib/v2/storybookTypes";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";

type V2StoryModeReaderProps = {
  story: V2GeneratedStory;
  photos: V2PhotoEntry[];
  printArtMode: StoryPrintArtMode;
  pageIndex: number;
  onPageIndexChange: (index: number) => void;
  resolveArtUrl: (photo: V2PhotoEntry) => Promise<string>;
  artUrlCache: Record<string, string>;
};

export function V2StoryModeReader({
  story,
  photos,
  printArtMode,
  pageIndex,
  onPageIndexChange,
  resolveArtUrl,
  artUrlCache,
}: V2StoryModeReaderProps) {
  const totalPages = story.pages.length + 2;
  const isIntro = pageIndex === 0;
  const isClosing = pageIndex === totalPages - 1;
  const storyPage = !isIntro && !isClosing ? story.pages[pageIndex - 1] : null;
  const photo =
    storyPage && photos.find((p) => p.id === storyPage.photoId);

  const artSrc = photo ? artUrlCache[photo.id] : null;

  useEffect(() => {
    if (photo && !artUrlCache[photo.id]) {
      void resolveArtUrl(photo);
    }
  }, [photo, artUrlCache, resolveArtUrl]);

  let bodyText = "";
  if (isIntro) {
    bodyText = story.introduction;
  } else if (isClosing) {
    bodyText = story.closing;
  } else if (storyPage) {
    bodyText = storyPage.text;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">
            Story mode
          </p>
          <h2 className="v2-brand-title text-lg text-v2-ink">{story.title}</h2>
        </div>
        <p className="text-xs text-v2-muted">
          Page {pageIndex + 1} of {totalPages}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto p-4 md:flex-row md:items-stretch">
        <div
          className={cn(
            "flex w-full items-center justify-center rounded-xl bg-v2-bg-subtle p-3 md:w-1/2",
            isIntro || isClosing ? "md:w-full" : "",
          )}
        >
          {photo && artSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artSrc}
              alt=""
              className="max-h-[min(50dvh,420px)] w-full rounded-lg object-contain"
            />
          ) : isIntro || isClosing ? (
            <div className="py-16 text-center text-sm text-v2-muted">
              {isIntro ? "Beginning" : "The end"}
            </div>
          ) : (
            <div className="py-16 text-sm text-v2-muted">Loading art…</div>
          )}
        </div>

        {!isIntro && !isClosing ? null : (
          <div className="hidden md:block" />
        )}

        <div className="flex w-full flex-col justify-center md:w-1/2">
          <p className="text-base leading-relaxed text-v2-ink md:text-lg">{bodyText}</p>
          {!isIntro && !isClosing ? (
            <p className="mt-3 text-xs text-v2-muted">
              Art:{" "}
              {printArtMode === "photos"
                ? "Original photo"
                : printArtMode === "coloring"
                  ? "Coloring page"
                  : "Blended photo + lines"}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
        <button
          type="button"
          disabled={pageIndex <= 0}
          onClick={() => onPageIndexChange(pageIndex - 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-v2-link disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          disabled={pageIndex >= totalPages - 1}
          onClick={() => onPageIndexChange(pageIndex + 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-v2-link disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
