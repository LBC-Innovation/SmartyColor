"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type V2SheetGeneratingPlaceholderProps = {
  imageSrc: string;
  imageAlt?: string;
  className?: string;
  imageFit?: "contain" | "cover";
  /** Smaller counter for library thumbnails */
  compact?: boolean;
};

export function V2SheetGeneratingPlaceholder({
  imageSrc,
  imageAlt = "",
  className,
  imageFit = "contain",
  compact,
}: V2SheetGeneratingPlaceholderProps) {
  const [elapsed, setElapsed] = useState(1);

  useEffect(() => {
    setElapsed(1);
    const timer = window.setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [imageSrc]);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-v2-bg-subtle",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
      aria-label={`Generating coloring sheet, ${elapsed} seconds`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={imageAlt}
        className={cn(
          "absolute inset-0 h-full w-full opacity-[0.38] saturate-[0.85]",
          imageFit === "cover" ? "object-cover" : "object-contain",
        )}
      />

      <div className="v2-sheet-generating-waves absolute inset-0" aria-hidden />

      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center",
          compact ? "gap-0.5" : "gap-1.5",
        )}
      >
        <span
          className={cn(
            "font-bold tabular-nums leading-none text-white drop-shadow-[0_2px_12px_rgba(10,16,26,0.45)]",
            compact ? "text-2xl" : "text-5xl sm:text-6xl",
          )}
        >
          {elapsed}
        </span>
        {!compact ? (
          <span className="text-sm font-semibold text-white/95 drop-shadow-md">
            Tracing your photo…
          </span>
        ) : null}
      </div>
    </div>
  );
}
