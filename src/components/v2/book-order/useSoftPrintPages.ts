"use client";

import { useEffect, useMemo, useState } from "react";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import { printRotationForBookPage } from "@/lib/print/bookPageImageFit";
import type { BookWizardPage } from "@/lib/print/bookWizardTypes";
import {
  BOOK_BLEED_IN,
  BOOK_MIN_SHEET_PPI,
  bookGutterIn,
  bookSheetPpi,
  type PageRotation,
} from "@/lib/print/pageLayout";

type Size = { width: number; height: number };

function readImageSize(src: string): Promise<Size | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Book page numbers whose coloring sheet has too few pixels for the size it is
 * printed at, so its lines would come out soft. Uses the same layout math as
 * the print file, so it flags exactly the pages the printer would.
 */
export function useSoftPrintPages(pages: BookWizardPage[], binding: BookBindingSpec): number[] {
  const [sizes, setSizes] = useState<Record<string, Size>>({});

  useEffect(() => {
    let cancelled = false;
    const missing = [
      ...new Set(pages.flatMap((p) => (p.kind === "photo" && !sizes[p.imageDataUrl] ? [p.imageDataUrl] : []))),
    ];
    if (missing.length === 0) return;
    void Promise.all(missing.map(async (src) => [src, await readImageSize(src)] as const)).then((read) => {
      if (cancelled) return;
      setSizes((prev) => {
        const next = { ...prev };
        // An unreadable image is recorded as empty so it isn't fetched again.
        for (const [src, size] of read) next[src] = size ?? { width: 0, height: 0 };
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [pages, sizes]);

  return useMemo(() => {
    const digital = binding.id === "digital";
    const gutterIn = bookGutterIn(binding.id, pages.length);
    const soft: number[] = [];
    pages.forEach((page, index) => {
      if (page.kind !== "photo") return;
      const size = sizes[page.imageDataUrl];
      if (!size?.width || !size.height) return;
      const ppi = bookSheetPpi({
        imageWidth: size.width,
        imageHeight: size.height,
        rotationDeg: printRotationForBookPage(page, binding) as PageRotation,
        fit: page.fit,
        gutterIn,
        bleedIn: digital ? 0 : BOOK_BLEED_IN,
      });
      if (ppi < BOOK_MIN_SHEET_PPI) soft.push(index + 1);
    });
    return soft;
  }, [pages, sizes, binding]);
}
