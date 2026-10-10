"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import {
  computeBookPageContainScale,
  printRotationForBookPage,
} from "@/lib/print/bookPageImageFit";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import { cn } from "@/lib/cn";

type Props = {
  page: BookWizardPhotoPage;
  binding: BookBindingSpec;
  className?: string;
  alt?: string;
};

/** Largest uniform scale that fits the full image on the page (letterboxed, never clipped or squished). */
export function BookPageImageFill({ page, binding, className, alt = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  const rotation = printRotationForBookPage(page, binding);

  const measureContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  useLayoutEffect(() => {
    measureContainer();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureContainer());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureContainer]);

  const scale =
    naturalSize && containerSize
      ? computeBookPageContainScale({
          containerWidth: containerSize.w,
          containerHeight: containerSize.h,
          imageWidth: naturalSize.w,
          imageHeight: naturalSize.h,
          rotationDeg: rotation,
        })
      : null;

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden bg-white", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={page.imageDataUrl}
        alt={alt || page.title}
        className="absolute left-1/2 top-1/2 max-h-none max-w-none"
        style={{
          transformOrigin: "center center",
          transform:
            scale != null
              ? `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`
              : `translate(-50%, -50%) rotate(${rotation}deg)`,
          opacity: scale != null ? 1 : 0,
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
