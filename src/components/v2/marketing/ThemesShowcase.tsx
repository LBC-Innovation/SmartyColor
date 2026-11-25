import { ArrowRight } from "lucide-react";
import { DESIGN_THEMES, LANDING_THEMES } from "@/content/marketing";
import { fillPackageCopy } from "@/lib/bookPackages/copy";
import { cn } from "@/lib/cn";
import { SectionHeading } from "@/components/v2/marketing/landingParts";

/**
 * The page's one dark room: real photo and coloring page pairs made with one theme (the owner's own
 * album), so a visitor sees what "same kids, new world" means. Nothing here is interactive but the
 * button: a guest can't make a themed page, so a theme picker would promise what the next screen
 * can't do.
 */
export function ThemesShowcase({ body, onStart }: { body: string; onStart: () => void }) {
  const { theme, pairs } = DESIGN_THEMES.examples;
  const shown = LANDING_THEMES.order.map((i) => pairs[i]).filter((p): p is (typeof pairs)[number] => Boolean(p));
  if (shown.length === 0) return null;
  const ideas = LANDING_THEMES.ideaIds.flatMap((id) => {
    const text = DESIGN_THEMES.starters.find((s) => s.id === id)?.text;
    return text ? [text] : [];
  });
  return (
    <section id="themes" className="scroll-mt-20 px-2 sm:px-3" aria-labelledby="themes-title">
      <div className="overflow-hidden rounded-[1.75rem] bg-v2-plum text-white lg:rounded-[2.25rem]">
        <div className="mx-auto grid w-full max-w-7xl gap-x-12 gap-y-8 px-5 py-14 sm:px-10 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-y-6 lg:px-14 lg:py-24">
          <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
            <SectionHeading align="left" tone="dark" eyebrow={LANDING_THEMES.eyebrow} title={LANDING_THEMES.title} body={body} id="themes-title" />
          </div>

          <ul className="mx-auto grid w-full max-w-[44rem] list-none grid-cols-2 items-end gap-3 sm:gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none lg:grid-cols-[1.2fr_1fr_1fr]">
            {shown.map((pair, i) => (
              <li key={pair.page} className={cn("min-w-0", i === 0 && "col-span-2 mx-auto w-full max-w-[20rem] lg:col-span-1 lg:max-w-none")}>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pair.page}
                    alt={pair.alt}
                    width={480}
                    height={640}
                    loading="lazy"
                    decoding="async"
                    className="block aspect-[3/4] w-full rounded-2xl bg-white object-contain"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pair.photo}
                    alt=""
                    width={480}
                    height={640}
                    loading="lazy"
                    decoding="async"
                    className="absolute -bottom-3 -left-2 aspect-[3/4] w-[34%] -rotate-2 rounded-xl object-cover shadow-lg ring-[3px] ring-white sm:-left-3"
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="lg:col-start-1 lg:row-start-2">
            <p className="text-sm font-semibold text-white">{fillPackageCopy(DESIGN_THEMES.examplesTheme, { theme })}</p>
            <p className="mt-3 text-sm leading-relaxed text-white/75">{ideas.join(" · ")}</p>
            <p className="mt-3 text-xs leading-relaxed text-white/65">{LANDING_THEMES.smallPrint}</p>
            <button
              type="button"
              onClick={onStart}
              className="mt-6 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-2 text-center text-base font-bold text-v2-primary shadow-lg transition hover:bg-v2-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
            >
              {LANDING_THEMES.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
