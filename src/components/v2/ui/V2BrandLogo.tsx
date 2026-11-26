import { cn } from "@/lib/cn";
import { BRAND_WORDMARK } from "./brandPaths";

/**
 * The crayon heart mark, rendered from design/brand/crayon-heart.svg by
 * scripts/generate-brand-assets.mjs. Its crayon texture is raster detail, so
 * the web gets trimmed WebP renders rather than the ~10 MB vector trace.
 */
export const CRAYON_MARK = {
  /** Small render for UI chrome (sharp up to ~80 CSS px at 3x). */
  small: "/brand/mark-256.webp",
  /** Large render for splash screens and big placements. */
  large: "/brand/mark.webp",
  /** Width / height of the trimmed art. Keep in sync with the generator's output. */
  aspect: 1.0642,
} as const;

// Horizontal lockup in wordmark units: the mark is LOCKUP_HEIGHT tall, then a gap,
// then the wordmark, optically centered on the mark.
const LOCKUP_HEIGHT = 400;
const MARK_WIDTH = Math.round(LOCKUP_HEIGHT * CRAYON_MARK.aspect);
/** Mirrors LOCKUP_GAP in scripts/generate-brand-assets.mjs. */
const LOCKUP_GAP = 24;
const WORDMARK_X = MARK_WIDTH + LOCKUP_GAP;
const LOCKUP_WIDTH = WORDMARK_X + BRAND_WORDMARK.width;

/**
 * Colorful Memories mark: a crayon-colored heart whose five petals close like a
 * camera shutter — a loved photo becoming something you color in.
 */
export function V2BrandMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static asset; srcSet covers density
    <img
      src={CRAYON_MARK.small}
      srcSet={`${CRAYON_MARK.small} 256w, ${CRAYON_MARK.large} 768w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt=""
      aria-hidden
      decoding="async"
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

/**
 * Mark + wordmark. `size` is the height of the lockup. With `compactOnMobile`,
 * phones (below `sm`) get the heart mark alone and wider screens the full lockup.
 */
export function V2BrandLogo({
  size = 38,
  className,
  compactOnMobile = false,
}: {
  size?: number;
  className?: string;
  compactOnMobile?: boolean;
}) {
  if (compactOnMobile) {
    return (
      <span className={cn("inline-flex shrink-0 items-center", className)}>
        <V2BrandMark size={size} className="sm:hidden" />
        <span className="sr-only sm:hidden">Colorful Memories</span>
        <V2BrandLogo size={size} className="hidden sm:block" />
      </span>
    );
  }

  return (
    <svg
      height={size}
      viewBox={`0 0 ${LOCKUP_WIDTH} ${LOCKUP_HEIGHT}`}
      fillRule="evenodd"
      className={cn("block h-auto max-w-full shrink-0", className)}
      style={{ width: (size * LOCKUP_WIDTH) / LOCKUP_HEIGHT }}
      role="img"
      aria-label="Colorful Memories"
    >
      <image href={CRAYON_MARK.small} width={MARK_WIDTH} height={LOCKUP_HEIGHT} />
      <g transform={`translate(${WORDMARK_X} ${BRAND_WORDMARK.y})`}>
        {BRAND_WORDMARK.paths.map((path) => (
          <path key={path.d} fill={path.fill} d={path.d} />
        ))}
      </g>
    </svg>
  );
}
