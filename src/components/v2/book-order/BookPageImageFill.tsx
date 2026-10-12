"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import { printRotationForBookPage } from "@/lib/print/bookPageImageFit";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import {
  BOOK_TRIM_HEIGHT_IN,
  BOOK_TRIM_WIDTH_IN,
  POINTS_PER_INCH,
  layoutImageOnPage,
  type PageRotation,
} from "@/lib/print/pageLayout";
import { cn } from "@/lib/cn";

type Props = {
  page: BookWizardPhotoPage;
  binding: BookBindingSpec;
  className?: string;
  alt?: string;
};

const PAGE_W_PT = BOOK_TRIM_WIDTH_IN * POINTS_PER_INCH;
const PAGE_H_PT = BOOK_TRIM_HEIGHT_IN * POINTS_PER_INCH;

/**
 * Shows the page exactly as the print engine lays it out: the whole image fitted
 * inside the print margin, centred, never clipped or squished. The geometry comes
 * from `layoutImageOnPage`, the same function the PDF builder uses.
 */
export function BookPageImageFill({ page, binding, className, alt = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  const rotation = printRotationForBookPage(page, binding) as PageRotation;
  // Mirror is applied after the rotation, so it flips the page as the reader sees it.
  const mirror = page.mirrored ? "scaleX(-1) " : "";

  const measureContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
  }, []);

  useLayoutEffect(() => {
    measureContainer();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureContainer());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureContainer]);

  const placement =
    naturalSize && containerWidth
      ? layoutImageOnPage({
          pageWidth: PAGE_W_PT,
          pageHeight: PAGE_H_PT,
          imageWidth: naturalSize.w,
          imageHeight: naturalSize.h,
          rotationDeg: rotation,
        })
      : null;
  // Page points -> screen pixels for the current preview size.
  const pxPerPt = containerWidth ? containerWidth / PAGE_W_PT : 0;

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden bg-white", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={page.imageDataUrl}
        alt={alt || page.title}
        className="absolute max-h-none max-w-none"
        style={{
          left: placement ? `${(placement.centerX / PAGE_W_PT) * 100}%` : "50%",
          top: placement ? `${(placement.centerY / PAGE_H_PT) * 100}%` : "50%",
          transformOrigin: "center center",
          transform: placement
            ? `translate(-50%, -50%) ${mirror}rotate(${rotation}deg) scale(${placement.scale * pxPerPt})`
            : `translate(-50%, -50%) ${mirror}rotate(${rotation}deg)`,
          opacity: placement ? 1 : 0,
        }}
        onLoad={(e) => {
          const img = e.currentTarget;
          setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          measureContainer();
        }}
      />
    </div>
  );
}
