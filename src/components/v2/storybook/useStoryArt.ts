"use client";

import { useCallback, useRef, useState } from "react";
import { applyPhotoCropDataUrl } from "@/lib/photo/applyPhotoCrop";
import { compositeSheetOverlayDataUrl } from "@/lib/photo/compositeSheetOverlay";
import type { StoryPrintArtMode } from "@/lib/v2/storybookTypes";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";

/** Everything that changes what a page's art looks like, so stale art is never shown. */
function artKey(photo: V2PhotoEntry, mode: StoryPrintArtMode): string {
  const crop = photo.crop
    ? [photo.crop.x, photo.crop.y, photo.crop.width, photo.crop.height]
        .map((n) => n.toFixed(3))
        .join(",")
    : "full";
  const sheet = photo.sheet ? (photo.activeRevisionId ?? "sheet") : "none";
  return `${photo.id}|${mode}|${crop}|${sheet}`;
}

/**
 * The picture printed on a story page: the (cropped) photo, its coloring
 * sheet, or the two blended. Results are cached per photo, crop, sheet and
 * mode, and each is composited at most once even when the reader and the PDF
 * ask for it at the same time.
 */
export function useStoryArt(mode: StoryPrintArtMode) {
  const cacheRef = useRef(new Map<string, string>());
  const inflightRef = useRef(new Map<string, Promise<string>>());
  const [, setVersion] = useState(0);

  const getArt = useCallback(
    (photo: V2PhotoEntry): string | null => cacheRef.current.get(artKey(photo, mode)) ?? null,
    [mode],
  );

  const ensureArt = useCallback(
    (photo: V2PhotoEntry): Promise<string> => {
      const key = artKey(photo, mode);
      const hit = cacheRef.current.get(key);
      if (hit) return Promise.resolve(hit);
      const pending = inflightRef.current.get(key);
      if (pending) return pending;

      const task = (async () => {
        let art = await applyPhotoCropDataUrl(
          photo.photoDataUrl || photo.previewUrl,
          photo.crop ?? null,
        );
        if (mode === "coloring" && photo.sheet) {
          art = photo.sheet.imageDataUrl;
        } else if (mode === "blended" && photo.sheet) {
          art = await compositeSheetOverlayDataUrl(art, photo.sheet.imageDataUrl, 45);
        }
        cacheRef.current.set(key, art);
        setVersion((v) => v + 1);
        return art;
      })();
      inflightRef.current.set(key, task);
      void task.finally(() => inflightRef.current.delete(key));
      return task;
    },
    [mode],
  );

  return { getArt, ensureArt };
}
