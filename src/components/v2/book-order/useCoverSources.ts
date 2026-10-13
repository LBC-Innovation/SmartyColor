"use client";

import { useEffect, useMemo, useState } from "react";
import type { BookCoverDesign } from "@/lib/print/bookCover";
import type { BookWizardPage, BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import { cachedImageUrl } from "@/lib/v2/imageCache";

export type CoverPicture = { pageId: string; title: string; src: string };

/** Whether any page still has its original color photo to put on the cover. */
export function hasOriginalPhotos(pages: BookWizardPage[]): boolean {
  return pages.some((p) => p.kind === "photo" && p.photoSource);
}

/**
 * The pictures available for the cover, in book order: each page's original
 * photo, or its coloring page. Originals are fetched on demand (they aren't
 * needed anywhere else in the wizard); a photo that can't be fetched falls back
 * to its coloring page.
 */
export function useCoverPictures(pages: BookWizardPage[], imageSource: BookCoverDesign["imageSource"]) {
  const photoPages = useMemo(
    () => pages.filter((p): p is BookWizardPhotoPage => p.kind === "photo"),
    [pages],
  );
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const wantOriginals = imageSource === "photos";

  useEffect(() => {
    if (!wantOriginals) return;
    let cancelled = false;
    for (const page of photoPages) {
      const source = page.photoSource;
      if (!source) continue;
      void cachedImageUrl(source.storagePath, source.url)
        .catch(() => page.imageDataUrl)
        .then((src) => {
          if (!cancelled) setOriginals((prev) => (prev[page.id] === src ? prev : { ...prev, [page.id]: src }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [photoPages, wantOriginals]);

  return useMemo(() => {
    const pictures: CoverPicture[] = [];
    let loading = false;
    for (const page of photoPages) {
      if (!wantOriginals || !page.photoSource) {
        pictures.push({ pageId: page.id, title: page.title, src: page.imageDataUrl });
      } else if (originals[page.id]) {
        pictures.push({ pageId: page.id, title: page.title, src: originals[page.id] });
      } else {
        loading = true;
      }
    }
    return { pictures, loading };
  }, [photoPages, wantOriginals, originals]);
}

/** The picture URLs a design actually draws: all of them, the chosen one, or none. */
export function coverSourcesFor(design: BookCoverDesign, pictures: CoverPicture[]): string[] {
  if (design.layout === "none") return [];
  if (design.layout === "grid") return pictures.map((p) => p.src);
  const chosen = pictures.find((p) => p.pageId === design.coverPageId) ?? pictures[0];
  return chosen ? [chosen.src] : [];
}
