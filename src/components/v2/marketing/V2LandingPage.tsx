"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  Gift,
  ImageIcon,
  MessageSquareText,
  Printer,
  ShieldCheck,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";
import {
  FAQ,
  FINAL_CTA,
  HERO_DEMO_NOTE,
  HERO_SECONDARY_CTA,
  HOW_IT_WORKS,
  LANDING_PAGES,
  PRICE_LINE,
  PRODUCTS,
  STICKY_CTA,
  WHY_FAMILIES,
  type HeroPair,
  type LandingIntent,
} from "@/content/marketing";
import { TESTIMONIALS } from "@/content/testimonials";
import { markGuestTryFree, STUDIO_PATH } from "@/lib/v2/guestSession";
import { fillCopy, formatUsd, rememberIntent, type CopyValues } from "@/lib/marketing/copy";
import type { HolidayOrderBy } from "@/lib/marketing/holiday";
import { HERO_STACK_SIZES, marketingSrcSet } from "@/lib/marketing/images";
import { HolidayBanner } from "@/components/v2/marketing/HolidayBanner";
import { MarketingFooter } from "@/components/v2/marketing/MarketingFooter";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = {
  image: ImageIcon,
  sparkles: Sparkles,
  printer: Printer,
  book: BookOpen,
  message: MessageSquareText,
  truck: Truck,
  shield: ShieldCheck,
};

export type LandingNumbers = { referencePriceCents: number | null; welcomeCreditCents: number | null };

type Props = {
  intent: LandingIntent;
  numbers: LandingNumbers;
  holiday: HolidayOrderBy | null;
};

/** The marketing page for one ad angle: `/` (default), `/gift` or `/story`. Copy comes from content/marketing.ts. */
export function V2LandingPage({ intent, numbers, holiday }: Props) {
  const router = useRouter();
  const page = LANDING_PAGES[intent];
  const values: CopyValues = {
    price: numbers.referencePriceCents != null ? formatUsd(numbers.referencePriceCents) : null,
    credit: numbers.welcomeCreditCents != null ? formatUsd(numbers.welcomeCreditCents) : null,
    date: holiday?.label ?? null,
  };
  const priceLine = fillCopy(PRICE_LINE, values);
  const faq = FAQ.items
    .map(({ q, a, fallback }) => ({ q, a: fillCopy(a, values) ?? (fallback ? fillCopy(fallback, values) : null) }))
    .filter((e): e is { q: string; a: string } => e.a != null);

  function startFree() {
    markGuestTryFree();
    rememberIntent(intent);
    router.push(intent === "default" ? STUDIO_PATH : `${STUDIO_PATH}?intent=${intent}`);
  }

  // Rendered without waiting for the session check so the hero is in the server HTML.
  return (
    <div className="v2-landing flex min-h-0 flex-1 flex-col overflow-y-auto bg-v2-bg text-v2-ink">
      {holiday ? <HolidayBanner label={holiday.label} /> : null}
      <V2MarketingHeader />

      <main className="flex-1">
        {/* ---------------------------------------------------------- hero */}
        <section className="relative overflow-hidden" aria-labelledby="hero-title">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(60%_50%_at_50%_0%,rgb(86_79_208/0.14),transparent_70%)]"
            aria-hidden
          />
          <div className="v2-gutter-x relative mx-auto grid w-full max-w-6xl gap-10 py-8 sm:py-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:py-20">
            <div className="text-center lg:text-left">
              <p className="inline-flex items-center gap-2 rounded-full border border-v2-primary/20 bg-white px-3 py-1 text-xs font-bold text-v2-link shadow-sm">
                {intent === "gift" ? (
                  <Gift className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                )}
                {page.eyebrow}
              </p>
              <h1 id="hero-title" className="v2-brand-title mt-4 text-[2.5rem] leading-[1.05] text-v2-ink sm:text-5xl lg:text-6xl">
                {page.headline[0]}
                <br />
                <span className="bg-gradient-to-r from-brand-coral via-brand-pink to-brand-violet bg-clip-text text-transparent">
                  {page.headline[1]}
                </span>
              </h1>
              <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-v2-muted sm:mt-5 sm:text-lg lg:mx-0">
                {page.subhead}
              </p>

              <div className="mt-6 flex flex-col items-stretch gap-3 sm:mt-7 sm:flex-row sm:justify-center lg:justify-start">
                <button
                  type="button"
                  onClick={startFree}
                  className="v2-btn-primary h-13 whitespace-nowrap px-7 text-base shadow-[0_8px_24px_rgb(86_79_208/0.3)]"
                >
                  {page.primaryCta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                <a
                  href="#how"
                  className="inline-flex h-11 items-center justify-center whitespace-nowrap text-sm font-bold text-v2-link underline-offset-4 hover:underline sm:h-13 sm:rounded-full sm:border sm:border-v2-primary/35 sm:bg-white sm:px-7 sm:text-base sm:no-underline sm:hover:bg-v2-primary-light"
                >
                  {HERO_SECONDARY_CTA}
                </a>
              </div>
              {priceLine ? <p className="mt-3 text-sm font-semibold text-v2-navy">{priceLine}</p> : null}

              <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-v2-muted lg:justify-start">
                {page.trustBullets.map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <PhotoToPageDemo hero={page.hero} />
          </div>
        </section>

        {/* -------------------------------------------------- how it works */}
        <section id="how" className="scroll-mt-20 border-y border-gray-200 bg-white">
          <div className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16">
            <SectionHeading eyebrow={HOW_IT_WORKS.eyebrow} title={HOW_IT_WORKS.title} body={HOW_IT_WORKS.body} />
            <ol className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-3 md:gap-6">
              {HOW_IT_WORKS.steps.map(({ icon, title, body }, i) => {
                const Icon = ICONS[icon];
                return (
                  <li key={title} className="relative rounded-2xl border border-gray-200 bg-v2-bg p-5 sm:p-6">
                    <span className="absolute right-4 top-4 text-4xl font-bold leading-none text-v2-primary/15 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-v2-primary-light text-v2-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-v2-ink">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-v2-muted">{body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* -------------------------------------------------- why families */}
        <section className="border-y border-gray-200 bg-white">
          <div className="v2-gutter-x mx-auto grid w-full max-w-6xl gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading align="left" eyebrow={WHY_FAMILIES.eyebrow} title={WHY_FAMILIES.title} body={WHY_FAMILIES.body} />
              <ul className="mt-7 space-y-4">
                {WHY_FAMILIES.points.map(({ icon, title, body }) => {
                  const Icon = ICONS[icon];
                  return (
                    <li key={title} className="flex gap-3.5">
                      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-v2-success-bg text-v2-success-text">
                        <Icon className="h-4.5 w-4.5" aria-hidden />
                      </span>
                      <span>
                        <span className="block font-semibold text-v2-ink">{title}</span>
                        <span className="block text-sm text-v2-muted">{body}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-v2-bg p-5 sm:p-6">
              <BeforeAfter className="mx-auto mb-6 max-w-sm" pair={WHY_FAMILIES.example} />
              <p className="text-xs font-bold uppercase tracking-wider text-v2-muted">{WHY_FAMILIES.useCasesTitle}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {WHY_FAMILIES.useCases.map((u) => (
                  <li
                    key={u}
                    className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-v2-navy"
                  >
                    {u}
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-xl bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-v2-muted">{WHY_FAMILIES.bestPhotosTitle}</p>
                <ul className="mt-2 space-y-1.5 text-sm text-v2-navy">
                  {WHY_FAMILIES.bestPhotos.map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- products */}
        <section className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16">
          <SectionHeading eyebrow={PRODUCTS.eyebrow} title={PRODUCTS.title} body={PRODUCTS.body} />
          <div className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-3 md:gap-5">
            {PRODUCTS.items.map(({ icon, name, tagline, price, points, cta, note, featured, badge }) => {
              const Icon = ICONS[icon];
              const priceText = fillCopy(price, values);
              const noteText = note ? fillCopy(note, values) : null;
              return (
                <article
                  key={name}
                  className={cn(
                    "relative flex flex-col rounded-2xl border bg-white p-5 sm:p-6",
                    featured
                      ? "border-v2-primary shadow-[0_12px_40px_rgb(86_79_208/0.18)] md:-my-2"
                      : "border-gray-200 shadow-sm",
                  )}
                >
                  {badge ? (
                    <span className="absolute -top-3 left-5 rounded-full bg-v2-primary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                      {badge}
                    </span>
                  ) : null}
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-v2-primary-light text-v2-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-xl font-semibold text-v2-ink">{name}</h3>
                  <p className="text-sm text-v2-muted">{tagline}</p>
                  {priceText ? <p className="mt-3 text-sm font-semibold text-v2-link">{priceText}</p> : null}
                  <ul className="mt-4 space-y-2 text-sm text-v2-navy">
                    {points.map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={startFree}
                    className={cn("mt-6 h-11 w-full", featured ? "v2-btn-primary" : "v2-btn-outline")}
                  >
                    {cta}
                  </button>
                  {noteText ? (
                    <p className="mt-2.5 text-center text-xs leading-snug text-v2-muted">{noteText}</p>
                  ) : null}
                </article>
              );
            })}
          </div>

          <ul className="mt-6 grid gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-v2-navy sm:mt-8 sm:grid-cols-3 sm:gap-4 sm:p-5">
            {PRODUCTS.trustStrip.map(({ icon, text }) => {
              const Icon = ICONS[icon];
              return (
                <li key={text} className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-v2-success-bg text-v2-success-text">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="font-semibold">{text}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <Testimonials />

        {/* ------------------------------------------------------------- faq */}
        <section className="v2-gutter-x mx-auto w-full max-w-3xl py-12 sm:py-16">
          <SectionHeading eyebrow={FAQ.eyebrow} title={FAQ.title} />
          <div className="mt-8 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {faq.map(({ q, a }) => (
              <details key={q} className="group px-5 py-4 open:bg-v2-bg/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-v2-ink [&::-webkit-details-marker]:hidden">
                  {q}
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-v2-bg-subtle text-v2-muted transition group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-v2-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------- final cta */}
        <section className="v2-gutter-x mx-auto w-full max-w-6xl pb-12 sm:pb-16">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-v2-primary to-[#4f2bc4] px-6 py-10 text-center text-white sm:px-10 sm:py-14">
            <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
            <h2 className="v2-brand-title text-3xl sm:text-4xl">{FINAL_CTA.title}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/80 sm:text-base">{FINAL_CTA.body}</p>
            {fillCopy(FINAL_CTA.creditBadge, values) ? (
              <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white">
                <Gift className="h-4 w-4" aria-hidden />
                {fillCopy(FINAL_CTA.creditBadge, values)}
              </p>
            ) : null}
            <div className="mt-7 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={startFree}
                className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-bold text-v2-primary shadow-lg transition hover:bg-v2-primary-light"
              >
                {intent === "default" ? FINAL_CTA.cta : page.primaryCta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <Link href="/sign-in" className="text-sm font-semibold text-white/85 underline-offset-4 hover:underline">
                {FINAL_CTA.signIn}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map(({ q, a }) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: { "@type": "Answer", text: a },
            })),
          }),
        }}
      />

      <MarketingFooter stickyCta />

      {/* Phone-only sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <button type="button" onClick={startFree} className="v2-btn-primary h-12 w-full text-base">
          {STICKY_CTA}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={cn(align === "center" && "text-center")}>
      <p className="text-xs font-bold uppercase tracking-wider text-v2-primary">{eyebrow}</p>
      <h2 className="v2-brand-title mt-2 text-3xl text-v2-ink sm:text-4xl">{title}</h2>
      {body ? (
        <p className={cn("mt-3 max-w-xl text-sm text-v2-muted sm:text-base", align === "center" && "mx-auto")}>
          {body}
        </p>
      ) : null}
    </div>
  );
}

/** Real customer quotes from content/testimonials.ts. Renders nothing until there is one. */
function Testimonials() {
  if (TESTIMONIALS.length === 0) return null;
  return (
    <section className="border-y border-gray-200 bg-white">
      <div className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16">
        <SectionHeading eyebrow="From families" title="What parents tell us" />
        <ul className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-3 md:gap-5">
          {TESTIMONIALS.map((t) => (
            <li key={`${t.firstName}-${t.consentDate}`} className="flex flex-col rounded-2xl border border-gray-200 bg-v2-bg p-5 sm:p-6">
              {t.pair ? <BeforeAfter className="mb-4" pair={{ ...t.pair, srcSetWidths: [] }} /> : null}
              <blockquote className="text-base leading-relaxed text-v2-ink">“{t.quote}”</blockquote>
              <p className="mt-3 text-sm font-semibold text-v2-muted">
                {t.firstName}, {t.relation}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const BEFORE_AFTER_SIZES = "(min-width: 640px) 170px, 40vw";

/** A real family photo beside the coloring page Colorful Memories made from it. Below the fold: lazy. */
function BeforeAfter({ pair, className }: { pair: HeroPair; className?: string }) {
  const { photoSrc, sheetSrc, photoAlt, sheetAlt, width, height, srcSetWidths } = pair;
  const aspect = `${width}/${height}`;
  return (
    <div className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3", className)}>
      <figure className="rotate-[-3deg] overflow-hidden rounded-2xl border-4 border-white bg-white shadow-[0_16px_40px_rgb(10_16_26/0.16)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc}
          srcSet={marketingSrcSet(photoSrc, srcSetWidths, width)}
          sizes={BEFORE_AFTER_SIZES}
          width={width}
          height={height}
          alt={photoAlt}
          style={{ aspectRatio: aspect }}
          className="block w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <figcaption className="px-3 py-2 text-center text-xs font-semibold text-v2-muted">Your photo</figcaption>
      </figure>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-v2-primary text-white shadow-md" aria-hidden>
        <ArrowRight className="h-4 w-4" />
      </span>
      <figure className="rotate-[3deg] overflow-hidden rounded-2xl border-4 border-white bg-white shadow-[0_16px_40px_rgb(10_16_26/0.16)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sheetSrc}
          srcSet={marketingSrcSet(sheetSrc, srcSetWidths, width)}
          sizes={BEFORE_AFTER_SIZES}
          width={width}
          height={height}
          alt={sheetAlt}
          style={{ aspectRatio: aspect }}
          className="block w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <figcaption className="px-3 py-2 text-center text-xs font-semibold text-v2-link">Coloring page</figcaption>
      </figure>
    </div>
  );
}

/** Hero showcase: photo → coloring page (stacked) → a printed book. */
function PhotoToPageDemo({ hero }: { hero: HeroPair }) {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="flex items-center justify-center">
        {/* photo with the coloring page laid over it: the hero of the hero */}
        <figure className="relative z-0 w-[15rem] shrink-0 sm:w-[23rem] lg:w-[27rem]">
          <div className="relative aspect-[5/4] w-full">
            <div className="absolute left-0 top-0 aspect-[4/3] w-[76%] rotate-[-5deg] overflow-hidden rounded-xl border-4 border-white bg-white shadow-[0_12px_30px_rgb(10_16_26/0.18)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.photoSrc}
                srcSet={marketingSrcSet(hero.photoSrc, hero.srcSetWidths, hero.width)}
                sizes={HERO_STACK_SIZES}
                width={hero.width}
                height={hero.height}
                alt={hero.photoAlt}
                className="block h-full w-full object-cover"
                fetchPriority="high"
              />
            </div>
            <div className="absolute bottom-0 right-0 aspect-[4/3] w-[76%] rotate-[4deg] overflow-hidden rounded-xl border-4 border-white bg-white shadow-[0_16px_36px_rgb(10_16_26/0.22)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.sheetSrc}
                srcSet={marketingSrcSet(hero.sheetSrc, hero.srcSetWidths, hero.width)}
                sizes={HERO_STACK_SIZES}
                width={hero.width}
                height={hero.height}
                alt={hero.sheetAlt}
                className="block h-full w-full object-cover"
                fetchPriority="high"
              />
            </div>
          </div>
          <figcaption className="mt-3 text-center text-xs font-semibold text-v2-muted">Photo → coloring page</figcaption>
        </figure>

        <span className="relative z-20 -mr-4 -ml-6 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-primary text-white shadow-md ring-4 ring-v2-bg sm:-mx-5 sm:h-10 sm:w-10" aria-hidden>
          <ArrowRight className="h-4 w-4" />
        </span>

        {/* the printed book: tucks under the stack's edge */}
        <figure className="relative z-10 -ml-7 shrink-0 sm:-ml-3">
          <PrintedBook />
          <figcaption className="mt-3 text-center text-xs font-semibold text-v2-link">Your printed book</figcaption>
        </figure>
      </div>
      <p className="mt-5 text-center text-xs text-v2-muted">
        {HERO_DEMO_NOTE[0]} <span className="font-semibold text-v2-ink">“{HERO_DEMO_NOTE[1]}”</span> {HERO_DEMO_NOTE[2]}
      </p>
    </div>
  );
}

/** CSS-only hardcover-style book with a real coloring page on the cover. */
function PrintedBook() {
  return (
    <div className="relative [perspective:1100px]" aria-hidden>
      <div className="relative mr-2 aspect-[3/4] w-[7rem] [transform:rotateY(-20deg)_rotateX(3deg)] [transform-style:preserve-3d] sm:w-[10rem]">
        {/* page block */}
        <div className="absolute inset-y-[4px] left-[8px] right-[-9px] rounded-r-md bg-[repeating-linear-gradient(to_right,#ffffff_0,#ffffff_1.5px,#d9dce3_1.5px,#d9dce3_2.5px)] shadow-[inset_-2px_0_3px_rgb(0_0_0/0.15)] [transform:translateZ(-8px)]" />
        <div className="absolute inset-x-[8px] bottom-[-7px] h-[8px] rounded-b-md bg-[repeating-linear-gradient(to_bottom,#ffffff_0,#ffffff_1.5px,#d9dce3_1.5px,#d9dce3_2.5px)] [transform:translateZ(-8px)]" />
        {/* cover */}
        <div className="absolute inset-0 overflow-hidden rounded-l-[4px] rounded-r-lg bg-gradient-to-br from-brand-violet via-v2-primary to-[#4f2bc4] shadow-[0_22px_40px_rgb(10_16_26/0.3),0_2px_6px_rgb(10_16_26/0.2)]">
          <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/30 via-black/10 to-transparent" />
          <div className="absolute inset-y-0 left-[14px] w-px bg-white/25" />
          <div className="absolute inset-x-4 top-4 bottom-[3.4rem] overflow-hidden rounded-md bg-white ring-1 ring-black/10 sm:inset-x-6 sm:top-5 sm:bottom-[3.75rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marketing/boys-sheet.webp"
              srcSet={marketingSrcSet("/marketing/boys-sheet.webp", [240, 400, 800], 900)}
              sizes="(min-width: 640px) 112px, 80px"
              width={900}
              height={1200}
              alt=""
              className="block h-full w-full object-cover object-top"
            />
          </div>
          <div className="absolute inset-x-4 bottom-2.5 sm:inset-x-6 sm:bottom-3.5">
            <p className="v2-wordmark truncate text-[12px] leading-tight text-white sm:text-[15px]">Beach Days</p>
            <p className="mt-0.5 truncate text-[7.5px] font-semibold uppercase tracking-[0.12em] text-white/70 sm:text-[9px]">
              Colorful Memories
            </p>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/25" />
        </div>
      </div>
    </div>
  );
}
