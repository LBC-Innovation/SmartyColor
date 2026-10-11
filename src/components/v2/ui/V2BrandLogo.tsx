import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * ColorfulMemories mark: a tilted photo tile with a bold rainbow crayon
 * stroke sweeping across it — a snapshot becoming something you color in.
 */
export function V2BrandMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const id = useId();
  const tile = `${id}-tile`;
  const stroke = `${id}-stroke`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={tile} x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6d66f0" />
          <stop offset="1" stopColor="#3f3aa6" />
        </linearGradient>
        <linearGradient id={stroke} x1="7" y1="30" x2="33" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset="0.5" stopColor="#ffd166" />
          <stop offset="1" stopColor="#2ee6b7" />
        </linearGradient>
      </defs>

      {/* photo tile, slightly tilted so it feels like a snapshot */}
      <g transform="rotate(-6 20 20)">
        <rect x="3" y="3" width="34" height="34" rx="10" fill={`url(#${tile})`} />
        <rect
          x="3"
          y="3"
          width="34"
          height="34"
          rx="10"
          stroke="#ffffff"
          strokeOpacity="0.18"
          strokeWidth="1.5"
        />
      </g>

      {/* crayon sweep */}
      <path
        d="M8 29 C 14 32, 18 20, 24 20 S 31 13, 33 10"
        stroke={`url(#${stroke})`}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* sparkle */}
      <path
        d="M12 9 l1.6 3.4 L17 14 l-3.4 1.6 L12 19 l-1.6 -3.4 L7 14 l3.4 -1.6 Z"
        fill="#ffffff"
      />
    </svg>
  );
}

/** Mark + wordmark. */
export function V2BrandLogo({
  size = 36,
  className,
  textClassName,
}: {
  size?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <V2BrandMark size={size} />
      <span
        className={cn(
          "v2-wordmark truncate text-[1.3rem] text-v2-ink sm:text-[1.45rem]",
          textClassName,
        )}
      >
        <span className="bg-gradient-to-r from-v2-primary via-[#7c3aed] to-[#ec4899] bg-clip-text pr-[0.04em] text-transparent">
          Colorful
        </span>
        Memories
      </span>
    </span>
  );
}
