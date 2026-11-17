"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { CONTACT_EMAIL, MADE_GALLERY, MADE_PHOTOS } from "@/content/marketing";
import { marketingSrcSet } from "@/lib/marketing/images";
import { cn } from "@/lib/cn";
import { SectionHeading } from "@/components/v2/marketing/landingParts";

const SHARE_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(MADE_GALLERY.shareSubject)}`;
// A slight, uneven lean so the row reads as snapshots rather than a product grid.
const TILTS = ["-rotate-[1.5deg]", "rotate-[1deg]", "-rotate-[0.5deg]", "rotate-[1.75deg]"] as const;

/**
 * "What people are making": a row of phone snapshots (MADE_PHOTOS) that swipes sideways. Arrows show
 * only while the row is wider than the screen; until then it sits centered. Hidden with no photos.
 */
export function MadeGallery() {
  const railRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setEdges({ start: rail.scrollLeft <= 4, end: rail.scrollLeft >= max - 4 });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    measure();
    rail.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(rail);
    return () => {
      rail.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure]);

  /**
   * Moves the row to the next or previous card. It scrolls to that card's exact snap position:
   * a plain scrollBy is a "directional" scroll to Chrome, which can skip past the card it lands on.
   */
  const slide = (dir: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const pad = parseFloat(getComputedStyle(rail).scrollPaddingLeft) || 0;
    const railLeft = rail.getBoundingClientRect().left;
    const max = rail.scrollWidth - rail.clientWidth;
    const stops = Array.from(rail.children).map((li) =>
      Math.min(max, Math.max(0, li.getBoundingClientRect().left - railLeft + rail.scrollLeft - pad)),
    );
    const at = rail.scrollLeft;
    const target = dir === 1 ? stops.find((x) => x > at + 2) ?? max : [...stops].reverse().find((x) => x < at - 2) ?? 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({ left: target, behavior: reduce ? "auto" : "smooth" });
  };

  if (MADE_PHOTOS.length === 0) return null;
  const scrolls = !(edges.start && edges.end);

  return (
    <section className="overflow-hidden bg-white py-14 sm:py-20" aria-labelledby="made-title">
      <div className="v2-gutter-x mx-auto w-full max-w-7xl">
        <SectionHeading eyebrow={MADE_GALLERY.eyebrow} title={MADE_GALLERY.title} body={MADE_GALLERY.body} id="made-title" />
      </div>

      <ul
        ref={railRef}
        className="mt-8 flex snap-x snap-mandatory justify-center-safe gap-4 overflow-x-auto scroll-px-5 px-5 py-4 [scrollbar-width:none] sm:mt-10 sm:scroll-px-8 sm:gap-6 sm:px-8 [&::-webkit-scrollbar]:hidden"
        aria-label={MADE_GALLERY.title}
      >
        {MADE_PHOTOS.map((photo, i) => (
          <li key={photo.src} className="w-[68vw] max-w-[17rem] shrink-0 snap-start sm:w-[16rem] lg:w-[18rem] lg:max-w-none">
            <figure
              className={cn(
                "relative overflow-hidden rounded-[1.75rem] bg-v2-butter shadow-[0_18px_40px_rgb(36_26_77/0.16)] ring-1 ring-v2-ink/10 transition-transform duration-300 hover:rotate-0 motion-reduce:transition-none",
                TILTS[i % TILTS.length],
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.src}
                srcSet={marketingSrcSet(photo.src, [400, 800], photo.width)}
                sizes="(min-width: 1024px) 288px, (min-width: 640px) 256px, 68vw"
                width={photo.width}
                height={photo.height}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
                style={{ aspectRatio: `${photo.width}/${photo.height}` }}
                className="block h-auto w-full object-cover"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-4 pb-4 pt-12 text-sm font-semibold leading-snug text-white">
                {photo.caption}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <div className="v2-gutter-x mx-auto mt-6 flex w-full max-w-7xl flex-col items-center gap-4 sm:mt-8">
        {scrolls ? (
          <div className="flex gap-3">
            {([-1, 1] as const).map((dir) => {
              const disabled = dir === -1 ? edges.start : edges.end;
              const Icon = dir === -1 ? ChevronLeft : ChevronRight;
              return (
                <button
                  key={dir}
                  type="button"
                  onClick={() => slide(dir)}
                  disabled={disabled}
                  aria-label={dir === -1 ? MADE_GALLERY.prev : MADE_GALLERY.next}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-v2-ink/15 bg-white text-v2-ink shadow-sm transition hover:bg-v2-cream disabled:opacity-35 disabled:hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </button>
              );
            })}
          </div>
        ) : null}
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-sm text-v2-muted">
          <Camera className="h-4 w-4 text-v2-primary" aria-hidden />
          {MADE_GALLERY.shareLead}
          <a
            href={SHARE_MAILTO}
            className="inline-flex min-h-11 items-center font-semibold text-v2-link underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
          >
            {MADE_GALLERY.shareLink}
          </a>
        </p>
      </div>
    </section>
  );
}
