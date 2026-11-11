"use client";

import { STORY_MODE_PUBLIC } from "@/lib/auth/features";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Gift } from "lucide-react";
import {
  FAQ,
  FINAL_CTA,
  HERO_DEMO_NOTE,
  HERO_SECONDARY_CTA,
  HOW_IT_WORKS,
  LANDING_PAGES,
  PARTNER_CONTACT,
  PRICE_LINE,
  PRODUCTS,
  STICKY_CTA,
  type CtaLocation,
  type HeroPair,
  type LandingIntent,
} from "@/content/marketing";
import { TESTIMONIALS } from "@/content/testimonials";
import { markGuestTryFree, STUDIO_PATH } from "@/lib/v2/guestSession";
import { fillCopy, rememberIntent, type NumbersInput } from "@/lib/marketing/copy";
import { landingFaq, landingValues } from "@/lib/marketing/landingValues";
import type { HolidayOrderBy } from "@/lib/marketing/holiday";
import { HERO_STACK_SIZES, marketingSrcSet } from "@/lib/marketing/images";
import { track, trackCta } from "@/lib/track";
import { HolidayBanner } from "@/components/v2/marketing/HolidayBanner";
import { MarketingFooter } from "@/components/v2/marketing/MarketingFooter";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";
import {
  CopyEmail,
  FinishedBookSection,
  GiftTimingSection,
  HolidayBlock,
  IdeasSection,
  OccasionsSection,
  PARTNER_MAILTO,
  PartnerContactSection,
  ReassuranceStrip,
  WhySection,
  type StartFree,
} from "@/components/v2/marketing/LandingSections";
import { BeforeAfter, ICONS, PrintedBook, SectionHeading } from "@/components/v2/marketing/landingParts";
import { cn } from "@/lib/cn";

export type LandingNumbers = NumbersInput;

type Props = {
  intent: LandingIntent;
  numbers: LandingNumbers;
  holiday: HolidayOrderBy | null;
};

/**
 * The marketing page for one audience: `/` (default), `/gift`, `/birthday`, `/pets`, `/partners`
 * or `/story`. Copy and the list of sections come from content/marketing.ts (LANDING_PAGES).
 */
export function V2LandingPage({ intent, numbers, holiday }: Props) {
  const router = useRouter();
  const page = LANDING_PAGES[intent];
  const sections = page.sections;
  const home = intent === "default";
  const EyebrowIcon = ICONS[page.eyebrowIcon];
  const values = landingValues(numbers, holiday?.label ?? null);
  const priceLine = fillCopy(PRICE_LINE, values);
  // Story mode shows only while it is on for everyone (see STORY_MODE_PUBLIC).
  const productItems = PRODUCTS.items.filter((item) => !("feature" in item) || STORY_MODE_PUBLIC);
  const faq = landingFaq(intent, values);
  // Christmas wording lasts only while the order-by date is set (it ends itself the day after).
  const eyebrow = holiday && page.holidayEyebrow ? page.holidayEyebrow : page.eyebrow;
  // The top banner is for the pages people reach through Christmas gift ads: home and gift only.
  const showBanner = holiday != null && (home || intent === "gift");

  /** Starts the free-page flow. `target` is the page whose promise the visitor is following. */
  const startFree: StartFree = (location: CtaLocation, target: LandingIntent = intent) => {
    trackCta(location, target);
    markGuestTryFree();
    rememberIntent(target);
    router.push(target === "default" ? STUDIO_PATH : `${STUDIO_PATH}?intent=${target}`);
  };
  const inquire = (location: "hero" | "final") => track("partner_inquiry", { location });

  // Rendered without waiting for the session check so the hero is in the server HTML.
  return (
    <div className="v2-landing flex min-h-0 flex-1 flex-col overflow-y-auto bg-v2-bg text-v2-ink">
      {showBanner && holiday ? <HolidayBanner label={holiday.label} /> : null}
      <V2MarketingHeader intent={intent} />

      <main className="flex-1">
        {/* ---------------------------------------------------------- hero */}
        <section className="relative overflow-hidden" aria-labelledby="hero-title">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(60%_50%_at_50%_0%,rgb(86_79_208/0.14),transparent_70%)]"
            aria-hidden
          />
          <div className="v2-gutter-x relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 py-8 sm:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-14 lg:py-20">
            <div className="min-w-0 text-center lg:text-left">
              <p className="inline-flex items-center gap-2 rounded-full border border-v2-primary/20 bg-white px-3 py-1 text-xs font-bold text-v2-link shadow-sm">
                <EyebrowIcon className="h-3.5 w-3.5" aria-hidden />
                {eyebrow}
              </p>
              <h1 id="hero-title" className="v2-brand-title mt-4 break-words text-[2.5rem] leading-[1.05] text-v2-ink sm:text-5xl lg:text-6xl">
                {page.headline[0]}
                <br />
                <span className="bg-gradient-to-r from-brand-coral via-brand-pink to-brand-violet bg-clip-text text-transparent">
                  {page.headline[1]}
                </span>
              </h1>
              <p className="mx-auto mt-4 max-w-lg break-words text-base leading-relaxed text-v2-muted sm:mt-5 sm:text-lg lg:mx-0">
                {page.subhead}
              </p>

              <div className="mt-6 flex flex-col items-stretch gap-3 sm:mt-7 sm:flex-row sm:justify-center lg:justify-start">
                {sections.partnerContact ? (
                  <>
                    <a
                      href={PARTNER_MAILTO}
                      onClick={() => inquire("hero")}
                      className="v2-btn-primary min-h-13 px-7 text-center text-base shadow-[0_8px_24px_rgb(86_79_208/0.3)]"
                    >
                      {page.primaryCta}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </a>
                    <button
                      type="button"
                      onClick={() => startFree("hero")}
                      className="v2-btn-outline min-h-13 px-7 text-center text-base"
                    >
                      {PARTNER_CONTACT.secondary}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startFree("hero")}
                      className="v2-btn-primary min-h-13 px-7 text-center text-base shadow-[0_8px_24px_rgb(86_79_208/0.3)]"
                    >
                      {page.primaryCta}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                    <a
                      href="#how"
                      className="inline-flex min-h-11 items-center justify-center text-center text-sm font-bold text-v2-link underline-offset-4 hover:underline sm:min-h-13 sm:rounded-full sm:border sm:border-v2-primary/35 sm:bg-white sm:px-7 sm:text-base sm:no-underline sm:hover:bg-v2-primary-light"
                    >
                      {HERO_SECONDARY_CTA}
                    </a>
                  </>
                )}
              </div>
              {sections.priceLine && priceLine ? <p className="mx-auto mt-3 max-w-lg text-sm font-semibold text-v2-navy lg:mx-0">{priceLine}</p> : null}
              {sections.partnerContact ? <CopyEmail className="mt-2 justify-center lg:justify-start" onCopy={() => inquire("hero")} /> : null}

              <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-v2-muted lg:justify-start">
                {page.trustBullets.map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <PhotoToPageDemo hero={page.hero} coverTitle={page.coverTitle} />
          </div>
        </section>

        {home && holiday ? <HolidayBlock label={holiday.label} /> : null}
        {home && sections.occasions ? (
          <OccasionsSection current={intent} holidayOn={holiday != null} onStart={startFree} />
        ) : null}
        {sections.giftTiming ? <GiftTimingSection values={values} /> : null}

        {/* ------------------------------------------- how it works, book */}
        {sections.howItWorks && !sections.partnerContact ? <HowItWorks /> : null}
        {home && sections.finishedBook ? <FinishedBookSection values={values} coverTitle={page.coverTitle} /> : null}

        {/* -------------------------------------------------- why, ideas */}
        <WhySection why={page.why} showBestPhotos={sections.bestPhotos} />
        {page.ideas ? <IdeasSection ideas={page.ideas} /> : null}
        {!home && sections.finishedBook ? <FinishedBookSection values={values} coverTitle={page.coverTitle} /> : null}
        {sections.partnerContact ? (
          <>
            <HowItWorks />
            <PartnerContactSection onInquiry={inquire} onStart={startFree} />
          </>
        ) : null}

        {/* -------------------------------------------------------- products */}
        {sections.products ? (
          <section className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16" aria-labelledby="products-title">
            <SectionHeading eyebrow={PRODUCTS.eyebrow} title={PRODUCTS.title} body={PRODUCTS.body} id="products-title" />
            <div
              className={cn(
                "mt-8 grid gap-4 sm:mt-10 md:gap-5",
                productItems.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2",
              )}
            >
              {productItems.map(({ icon, name, tagline, price, points, cta, note, featured, badge }) => {
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
                      onClick={() => startFree("products")}
                      aria-label={`${cta}: ${name}`}
                      className={cn("mt-6 min-h-11 w-full px-3 text-center", featured ? "v2-btn-primary" : "v2-btn-outline")}
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

            {sections.reassurance ? <ReassuranceStrip /> : null}
          </section>
        ) : null}

        {!home && sections.occasions ? (
          <OccasionsSection current={intent} holidayOn={holiday != null} onStart={startFree} />
        ) : null}

        <Testimonials />

        {/* ------------------------------------------------------------- faq */}
        <section className="v2-gutter-x mx-auto w-full max-w-3xl py-12 sm:py-16" aria-labelledby="faq-title">
          <SectionHeading eyebrow={FAQ.eyebrow} title={FAQ.title} id="faq-title" />
          <div className="mt-8 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {faq.map(({ q, a, link }) => (
              <details key={q} className="group open:bg-v2-bg/60">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-base font-semibold text-v2-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-v2-primary [&::-webkit-details-marker]:hidden">
                  {q}
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-v2-bg-subtle text-v2-muted transition group-open:rotate-45 motion-reduce:transition-none"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <div className="px-5 pb-4 text-sm leading-relaxed text-v2-muted">
                  <p>{a}</p>
                  {link ? (
                    <Link
                      href={link.href}
                      className="mt-1 inline-flex min-h-11 items-center font-semibold text-v2-link underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
                    >
                      {link.label}
                    </Link>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------- final cta */}
        {sections.partnerContact ? null : (
          <section className="v2-gutter-x mx-auto w-full max-w-6xl pb-12 sm:pb-16" aria-labelledby="final-title">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-v2-primary to-[#4f2bc4] px-6 py-10 text-center text-white sm:px-10 sm:py-14">
              <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
              <h2 id="final-title" className="v2-brand-title text-3xl sm:text-4xl">
                {FINAL_CTA.title}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-white sm:text-base">{FINAL_CTA.body}</p>
              {fillCopy(FINAL_CTA.creditBadge, values) ? (
                <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white">
                  <Gift className="h-4 w-4" aria-hidden />
                  {fillCopy(FINAL_CTA.creditBadge, values)}
                </p>
              ) : null}
              <ul className="mx-auto mt-4 flex max-w-lg flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-white">
                {FINAL_CTA.points.map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => startFree("final")}
                  aria-label={`${FINAL_CTA.cta}: ${FINAL_CTA.title}`}
                  className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-white px-8 py-2 text-center text-base font-bold text-v2-primary shadow-lg transition hover:bg-v2-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {FINAL_CTA.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                <Link href="/sign-in" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-white underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  {FINAL_CTA.signIn}
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

      <MarketingFooter stickyCta />

      {/* Phone-only sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        {sections.partnerContact ? (
          <a href="#contact" className="v2-btn-primary min-h-12 w-full px-3 text-center text-base">
            {page.primaryCta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        ) : (
          <button
            type="button"
            onClick={() => startFree("sticky")}
            aria-label={`${STICKY_CTA}: ${eyebrow}`}
            className="v2-btn-primary min-h-12 w-full px-3 text-center text-base"
          >
            {STICKY_CTA}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

/** Three steps from photo to book. Its #how anchor is the hero's secondary link. */
function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-y border-gray-200 bg-white" aria-labelledby="how-title">
      <div className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16">
        <SectionHeading eyebrow={HOW_IT_WORKS.eyebrow} title={HOW_IT_WORKS.title} body={HOW_IT_WORKS.body} id="how-title" />
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

/** Hero showcase: photo → coloring page (stacked) → a printed book. */
function PhotoToPageDemo({ hero, coverTitle }: { hero: HeroPair; coverTitle: string }) {
  // A portrait photo keeps its whole frame: the stack switches to 3:4 prints instead of cropping to 4:3.
  const portrait = hero.height > hero.width;
  const box = portrait ? "h-[84%] aspect-[3/4]" : "aspect-[4/3] w-[76%]";
  const img = "block h-full w-full object-cover";
  return (
    <div className="relative mx-auto w-full min-w-0 max-w-md sm:max-w-xl lg:max-w-none">
      <div className="flex min-w-0 items-center justify-center">
        {/* photo with the coloring page laid over it: the hero of the hero. Percent widths keep
            the whole demo inside a 320px screen; the rem widths apply from tablet up. */}
        <figure className="relative z-0 w-[68%] min-w-0 sm:w-[23rem] lg:w-[27rem]">
          <div className={cn("relative w-full", portrait ? "aspect-square" : "aspect-[5/4]")}>
            <div className={cn("absolute left-0 top-0 rotate-[-5deg] overflow-hidden rounded-xl border-4 border-white bg-white shadow-[0_12px_30px_rgb(10_16_26/0.18)]", box)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.photoSrc}
                srcSet={marketingSrcSet(hero.photoSrc, hero.srcSetWidths, hero.width)}
                sizes={HERO_STACK_SIZES}
                width={hero.width}
                height={hero.height}
                alt={hero.photoAlt}
                className={img}
                fetchPriority="high"
              />
            </div>
            <div className={cn("absolute bottom-0 right-0 rotate-[4deg] overflow-hidden rounded-xl border-4 border-white bg-white shadow-[0_16px_36px_rgb(10_16_26/0.22)]", box)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.sheetSrc}
                srcSet={marketingSrcSet(hero.sheetSrc, hero.srcSetWidths, hero.width)}
                sizes={HERO_STACK_SIZES}
                width={hero.width}
                height={hero.height}
                alt={hero.sheetAlt}
                className={img}
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
        <figure className="relative z-10 -ml-7 w-[30%] min-w-0 sm:-ml-3 sm:w-40">
          <PrintedBook title={coverTitle} />
          <figcaption className="mt-3 text-center text-xs font-semibold text-v2-link">Your printed book</figcaption>
        </figure>
      </div>
      <p className="mt-5 text-center text-xs text-v2-muted">
        {HERO_DEMO_NOTE[0]} <span className="font-semibold text-v2-ink">“{HERO_DEMO_NOTE[1]}”</span> {HERO_DEMO_NOTE[2]}
      </p>
    </div>
  );
}
