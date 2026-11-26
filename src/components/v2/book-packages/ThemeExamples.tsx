import { ArrowRight } from "lucide-react";
import { DESIGN_THEMES } from "@/content/marketing";
import { fillPackageCopy } from "@/lib/bookPackages/copy";
import { cn } from "@/lib/cn";

type Pair = { photo: string; page: string; alt: string; width?: number; height?: number };

/**
 * Real photo → coloring page pairs, so people can see what they'll get before choosing. `variant="theme"`
 * shows pages made with one theme; `variant="plain"` shows pages made with no theme, for while "No theme"
 * is picked. A row that swipes sideways on a phone and fits in one line on wider screens.
 */
export function ThemeExamples({ className, variant = "theme" }: { className?: string; variant?: "theme" | "plain" }) {
  const plain = variant === "plain";
  const pairs: readonly Pair[] = plain ? DESIGN_THEMES.plainExamples : DESIGN_THEMES.examples.pairs;
  if (pairs.length === 0) return null;
  return (
    <figure className={className}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-semibold text-v2-ink">
          {plain ? DESIGN_THEMES.examplesPlainTitle : DESIGN_THEMES.examplesTitle}
        </span>
        <span className="text-xs text-v2-muted">
          {plain
            ? DESIGN_THEMES.examplesPlainNote
            : fillPackageCopy(DESIGN_THEMES.examplesTheme, { theme: DESIGN_THEMES.examples.theme })}
        </span>
      </figcaption>
      {/* contain:inline-size: the swipe row must take the page's width, never widen the page to fit it. */}
      <ul
        className={cn(
          "-mx-1 mt-2 flex snap-x [contain:inline-size] sm:[contain:none] snap-mandatory list-none gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0",
          pairs.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3",
        )}
      >
        {pairs.map((pair) => {
          const aspectRatio = `${pair.width ?? 3} / ${pair.height ?? 4}`;
          const landscape = (pair.width ?? 3) > (pair.height ?? 4);
          return (
            <li
              key={pair.page}
              className={cn(
                "flex shrink-0 snap-start flex-col justify-center rounded-2xl border border-gray-200 bg-white p-2 sm:w-auto",
                landscape ? "w-[18rem]" : "w-[15rem]",
              )}
            >
              <div className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pair.photo}
                  alt=""
                  loading="lazy"
                  style={{ aspectRatio }}
                  className="min-w-0 flex-1 rounded-lg object-cover"
                />
                <ArrowRight className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pair.page}
                  alt={pair.alt}
                  loading="lazy"
                  style={{ aspectRatio }}
                  className="min-w-0 flex-1 rounded-lg border border-gray-100 bg-white object-contain"
                />
              </div>
              <div className="mt-1 flex text-[11px] text-v2-muted" aria-hidden>
                <span className="flex-1 text-center">{DESIGN_THEMES.examplesPhoto}</span>
                <span className="w-5" />
                <span className="flex-1 text-center">{DESIGN_THEMES.examplesPage}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
