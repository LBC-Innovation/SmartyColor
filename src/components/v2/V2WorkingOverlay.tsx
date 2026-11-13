"use client";

import { cn } from "@/lib/cn";
import { useLoadingCaption } from "@/components/v2/useLoadingCaption";

const SCRIBBLE = "M10 52 C 22 20, 34 20, 40 46 S 58 70, 66 40 S 86 12, 94 38 S 108 60, 112 30";

type V2WorkingOverlayProps = {
  /** edit: a pencil scribbles over the page. portrait: a frame turns from wide to tall. */
  variant: "edit" | "portrait";
  /** Read once by screen readers. */
  label: string;
  className?: string;
};

/**
 * Covers an image while the studio works on it, with a small looping drawing
 * and rotating captions instead of a spinner and a clock.
 */
export function V2WorkingOverlay({ variant, label, className }: V2WorkingOverlayProps) {
  const { caption, key } = useLoadingCaption(variant);

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/70 p-4 text-center backdrop-blur-[2px]",
        className,
      )}
      aria-busy="true"
    >
      <span role="status" className="sr-only">
        {label}
      </span>

      {variant === "edit" ? (
        <svg aria-hidden viewBox="0 0 120 80" className="h-20 w-28 overflow-visible">
          <path
            className="v2-scribble"
            d={SCRIBBLE}
            fill="none"
            stroke="var(--color-v2-primary)"
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={100}
          />
          <g className="v2-scribble-pencil">
            <animateMotion
              dur="2.6s"
              repeatCount="indefinite"
              calcMode="linear"
              keyPoints="0;1;1;1"
              keyTimes="0;0.55;0.7;1"
              path={SCRIBBLE}
            />
            <g transform="rotate(35)">
              <rect x="-3" y="-22" width="6" height="18" rx="1.5" fill="#fcd34d" stroke="var(--color-v2-navy)" strokeWidth="1.5" />
              <path d="M-3 -4 L0 3 L3 -4 Z" fill="#fde68a" stroke="var(--color-v2-navy)" strokeWidth="1.5" strokeLinejoin="round" />
              <rect x="-3" y="-26" width="6" height="4" rx="1" fill="#f9a8d4" stroke="var(--color-v2-navy)" strokeWidth="1.5" />
            </g>
          </g>
        </svg>
      ) : (
        <div aria-hidden className="relative flex h-24 w-24 items-center justify-center">
          <span className="v2-turning-frame absolute rounded-lg border-[3px] border-v2-primary bg-white/80 shadow-lg shadow-v2-primary/20">
            <span className="v2-turning-frame-sky absolute inset-x-0 top-0 rounded-t-[5px] bg-sky-200/80" />
            <span className="absolute bottom-[18%] left-1/2 h-[30%] w-[22%] -translate-x-1/2 rounded-t-full bg-v2-primary/70" />
            <span className="absolute bottom-[18%] left-[22%] h-[20%] w-[16%] rounded-t-full bg-v2-primary/40" />
          </span>
        </div>
      )}

      <span
        key={key}
        aria-hidden
        className="v2-caption-swap rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-v2-navy shadow-md shadow-v2-navy/10"
      >
        {caption}
      </span>
    </div>
  );
}
