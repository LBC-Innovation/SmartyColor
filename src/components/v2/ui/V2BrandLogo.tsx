import { cn } from "@/lib/cn";
import { BRAND_MARK, BRAND_WORDMARK } from "./brandPaths";

// Horizontal lockup: the wordmark sits right of the mark, optically centered on it.
const LOCKUP_WIDTH = BRAND_WORDMARK.x + BRAND_WORDMARK.width;

function BrandPaths({ paths }: { paths: readonly { fill: string; d: string }[] }) {
  return paths.map((path) => <path key={path.d} fill={path.fill} d={path.d} />);
}

/**
 * Colorful Memories mark: a heart whose five colored petals close like a camera
 * shutter — a loved photo becoming something you color in.
 */
export function V2BrandMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BRAND_MARK.width} ${BRAND_MARK.height}`}
      fillRule="evenodd"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <BrandPaths paths={BRAND_MARK.paths} />
    </svg>
  );
}

/** Mark + wordmark. `size` is the height of the lockup. */
export function V2BrandLogo({
  size = 38,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      height={size}
      viewBox={`0 0 ${LOCKUP_WIDTH} ${BRAND_MARK.height}`}
      fillRule="evenodd"
      className={cn("block h-auto max-w-full shrink-0", className)}
      style={{ width: (size * LOCKUP_WIDTH) / BRAND_MARK.height }}
      role="img"
      aria-label="Colorful Memories"
    >
      <BrandPaths paths={BRAND_MARK.paths} />
      <g transform={`translate(${BRAND_WORDMARK.x} ${BRAND_WORDMARK.y})`}>
        <BrandPaths paths={BRAND_WORDMARK.paths} />
      </g>
    </svg>
  );
}
