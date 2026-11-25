import { ArrowRight } from "lucide-react";
import { DESIGN_THEMES } from "@/content/marketing";
import { fillPackageCopy } from "@/lib/bookPackages/copy";

/**
 * Real photo → coloring page pairs made with one theme, so people can see what a theme does
 * before choosing one. A row that swipes sideways on a phone and fits in one line on wider screens.
 */
export function ThemeExamples({ className }: { className?: string }) {
  const { theme, pairs } = DESIGN_THEMES.examples;
  if (pairs.length === 0) return null;
  return (
    <figure className={className}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-semibold text-v2-ink">{DESIGN_THEMES.examplesTitle}</span>
        <span className="text-xs text-v2-muted">{fillPackageCopy(DESIGN_THEMES.examplesTheme, { theme })}</span>
      </figcaption>
      {/* contain:inline-size: the swipe row must take the page's width, never widen the page to fit it. */}
      <ul className="-mx-1 mt-2 flex snap-x [contain:inline-size] sm:[contain:none] snap-mandatory list-none gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
        {pairs.map((pair) => (
          <li
            key={pair.page}
            className="w-[15rem] shrink-0 snap-start rounded-2xl border border-gray-200 bg-white p-2 sm:w-auto"
          >
            <div className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pair.photo}
                alt=""
                width={480}
                height={640}
                loading="lazy"
                className="aspect-[3/4] min-w-0 flex-1 rounded-lg object-cover"
              />
              <ArrowRight className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pair.page}
                alt={pair.alt}
                width={480}
                height={640}
                loading="lazy"
                className="aspect-[3/4] min-w-0 flex-1 rounded-lg border border-gray-100 bg-white object-contain"
              />
            </div>
            <div className="mt-1 flex text-[11px] text-v2-muted" aria-hidden>
              <span className="flex-1 text-center">{DESIGN_THEMES.examplesPhoto}</span>
              <span className="w-5" />
              <span className="flex-1 text-center">{DESIGN_THEMES.examplesPage}</span>
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
