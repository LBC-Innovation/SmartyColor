"use client";

import { STORY_MODE_PUBLIC } from "@/lib/auth/features";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, Check, Gift } from "lucide-react";
import {
  FAQ,
  FINAL_CTA,
  FINAL_CTA_PHOTOS,
  HERO_PRICE_TAG,
  HERO_SECONDARY_CTA,
  LIFESTYLE_PHOTOS,
  HOW_IT_WORKS,
  LANDING_PAGES,
  PARTNER_CONTACT,
  PRIMARY_CTA,
  PRODUCTS,
  STICKY_CTA,
  TRANSFORM,
  type CtaLocation,
  type HeroPair,
  type LandingIntent,
} from "@/content/marketing";
import { TESTIMONIALS } from "@/content/testimonials";
import { markGuestTryFree, STUDIO_PATH } from "@/lib/v2/guestSession";
import { fillCopy, rememberIntent, type NumbersInput } from "@/lib/marketing/copy";
import { landingFaq, landingValues } from "@/lib/marketing/landingValues";
import type { HolidayOrderBy } from "@/lib/marketing/holiday";
import { marketingSrcSet } from "@/lib/marketing/images";
import { HERO_PHOTO_SIZES, heroImage } from "@/lib/marketing/heroImage";
import { track, trackCta } from "@/lib/track";
import { HolidayBanner } from "@/components/v2/marketing/HolidayBanner";
import { MarketingFooter } from "@/components/v2/marketing/MarketingFooter";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";
import { ScrollToTopButton } from "@/components/v2/marketing/ScrollToTopButton";
import {
  CopyEmail,
  FinishedBookSection,
  GiftTimingSection,
  HolidayToast,
  IdeasSection,
  OccasionsSection,
  PARTNER_MAILTO,
  PartnerContactSection,
  PhotoBand,
  ReassuranceStrip,
  WhySection,
  type StartFree,
} from "@/components/v2/marketing/LandingSections";
import { BeforeAfter, ICONS, LifestyleImage, PrintedBook, SectionHeading } from "@/components/v2/marketing/landingParts";
import { CompareSlider } from "@/components/v2/marketing/CompareSlider";
import { MadeGallery } from "@/components/v2/marketing/MadeGallery";
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
  const tagPrice = fillCopy(HERO_PRICE_TAG.price, values);
  const tagDetail = fillCopy(HERO_PRICE_TAG.detail, values);
  const priceTag = sections.priceLine && tagPrice && tagDetail ? { label: HERO_PRICE_TAG.label, price: tagPrice, detail: tagDetail } : null;
  // The sign-up gift, as a button in the same card. Not on the partners page, which sells to businesses.
  const signUpOffer = sections.partnerContact ? null : fillCopy(HERO_PRICE_TAG.signUp, values);
  const signUpLabel = fillCopy(HERO_PRICE_TAG.signUpLabel, values) ?? undefined;
  const heroPhoto = heroImage(page);
  // Every real photo-and-page pair on this page, once each, for the before/after switcher.
  const examplePairs = [page.hero, page.why.example].filter((p, i, all) => all.findIndex((q) => q.photoSrc === p.photoSrc) === i);
  // Story mode shows only while it is on for everyone (see STORY_MODE_PUBLIC).
  const productItems = PRODUCTS.items.filter((item) => !("feature" in item) || STORY_MODE_PUBLIC);
  const faq = landingFaq(intent, values);
  // Christmas wording lasts only while the order-by date is set (it ends itself the day after).
  const eyebrow = holiday && page.holidayEyebrow ? page.holidayEyebrow : page.eyebrow;
  // The top banner is for the gift page, which people reach through Christmas gift ads. Home shows
  // the same date in its dismissible toast instead.
  const showBanner = holiday != null && intent === "gift";
  const finalPhoto = FINAL_CTA_PHOTOS.find((id) => LIFESTYLE_PHOTOS[id].ready && id !== page.heroPhoto) ?? null;

  /** Starts the free-page flow. `target` is the page whose promise the visitor is following. */
  const startFree: StartFree = (location: CtaLocation, target: LandingIntent = intent) => {
    trackCta(location, target);
    markGuestTryFree();
    rememberIntent(target);
    router.push(target === "default" ? STUDIO_PATH : `${STUDIO_PATH}?intent=${target}`);
  };
  const inquire = (location: "hero" | "final") => track("partner_inquiry", { location });

  // A plain #how jump is instant, so it reads as the page flashing rather than moving down. Glide
  // there instead; scrollIntoView moves whichever box scrolls (the window, or this container on
  // desktop) and honours the section's scroll-mt so the header doesn't cover the heading.
  const scrollToHow = (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById("how");
    if (!target) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", "#how");
  };

  // The phone's sticky button shows only once the hero's own button has scrolled out of view, so the
  // same button is never on screen twice. The page scrolls inside this container, not the window;
  // an IntersectionObserver with the default root still sees a target clipped by a scrolling parent.
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  useEffect(() => {
    const el = heroCtaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setHeroCtaVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Rendered without waiting for the session check so the hero is in the server HTML.
  // A strip of the hero band's light top color across the top, under the header, so the translucent white bar
  // picks up a faint tint where it starts. bg-local keeps it with the content when this box scrolls.
  return (
    <div ref={scrollBoxRef} className="v2-landing flex flex-1 flex-col lg:min-h-0 lg:overflow-y-auto bg-v2-cream bg-[linear-gradient(var(--color-v2-butter),var(--color-v2-butter))] bg-[length:100%_12rem] bg-no-repeat bg-local text-v2-ink">
      {showBanner && holiday ? <HolidayBanner label={holiday.label} /> : null}
      <V2MarketingHeader intent={intent} wide tinted />

      <main className="flex-1">
        {/* ---------------------------------------------------------- hero */}
        {/* Edge to edge, like a photo: the picture fills the right (the top on a phone) and the text
            sits on the plum it fades into. A thin inset keeps the rounded corners off the screen edge. */}
        <section className="bg-gradient-to-b from-v2-butter to-v2-mast px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6" aria-labelledby="hero-title">
          <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-v2-plum text-white lg:flex lg:min-h-[min(88vh,50rem)] lg:items-center lg:rounded-[2.25rem]">
            <div className="relative aspect-[4/3] w-full sm:aspect-[16/9] lg:absolute lg:inset-y-0 lg:left-[30%] lg:right-0 lg:aspect-auto lg:w-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroPhoto.src}
                srcSet={heroPhoto.srcSet}
                sizes={HERO_PHOTO_SIZES}
                width={heroPhoto.width}
                height={heroPhoto.height}
                alt={heroPhoto.alt}
                fetchPriority="high"
                className="block h-full w-full object-cover"
              />
              {/* phone and tablet: the photo fades into the plum the text sits on */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-v2-plum to-transparent lg:hidden" aria-hidden />
            </div>
            <div
              className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(to_right,var(--color-v2-plum)_30%,rgb(36_26_77/0.7)_42%,rgb(36_26_77/0.1)_60%,transparent_72%)] lg:block"
              aria-hidden
            />

            <div className="relative -mt-6 w-full px-5 pb-8 sm:-mt-10 sm:px-10 sm:pb-12 lg:mt-0 lg:max-w-[44rem] lg:px-16 lg:py-20 xl:px-20">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur">
                <EyebrowIcon className="h-3.5 w-3.5 text-brand-amber" aria-hidden />
                {eyebrow}
              </p>
              <h1 id="hero-title" className="v2-brand-title mt-4 break-words text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-[4.5rem]">
                {page.headline[0]} <span className="v2-crayon-underline">{page.headline[1]}</span>
              </h1>
              <p className="mt-4 max-w-lg break-words text-base leading-relaxed text-white/85 sm:mt-5 sm:text-lg">{page.subhead}</p>

              <div ref={heroCtaRef} className="mt-6 flex flex-col items-stretch gap-3 sm:mt-7 sm:flex-row sm:items-center">
                {sections.partnerContact ? (
                  <>
                    <a
                      href={PARTNER_MAILTO}
                      onClick={() => inquire("hero")}
                      className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-white px-7 py-2 text-center text-base font-bold text-v2-primary shadow-lg transition hover:bg-v2-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {page.primaryCta}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </a>
                    <button
                      type="button"
                      onClick={() => startFree("hero")}
                      className="inline-flex min-h-13 items-center justify-center rounded-full border border-white/40 px-7 text-center text-base font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {PARTNER_CONTACT.secondary}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startFree("hero")}
                      className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-white px-7 py-2 text-center text-base font-bold text-v2-primary shadow-lg transition hover:bg-v2-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {page.primaryCta}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                    <a
                      href="#how"
                      onClick={scrollToHow}
                      className="inline-flex min-h-11 items-center justify-center px-2 text-center text-base font-bold text-white underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {HERO_SECONDARY_CTA}
                    </a>
                  </>
                )}
              </div>
              {sections.partnerContact ? (
                <div className="mt-3 inline-flex rounded-2xl bg-white px-3">
                  <CopyEmail onCopy={() => inquire("hero")} />
                </div>
              ) : null}

              {priceTag || signUpOffer ? (
                <div className="mt-5 flex max-w-md flex-col gap-3 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/20 backdrop-blur">
                  {priceTag ? (
                    <div className="flex flex-col">
                      <span className="text-xs font-bold uppercase tracking-wider text-brand-amber">{priceTag.label}</span>
                      <span className="v2-wordmark mt-1.5 text-2xl text-white">{priceTag.price}</span>
                      <span className="mt-1 text-sm text-white/80">{priceTag.detail}</span>
                    </div>
                  ) : null}
                  {priceTag && signUpOffer ? <div className="border-t border-white/15" aria-hidden /> : null}
                  {signUpOffer ? (
                    <Link
                      href="/sign-up"
                      aria-label={signUpLabel}
                      onClick={() => trackCta("hero_signup", intent)}
                      className={`inline-flex min-h-11 items-center justify-center gap-2 self-start whitespace-nowrap rounded-full border-2 border-brand-amber px-5 text-sm font-bold text-brand-amber transition hover:bg-brand-amber/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:text-base${priceTag ? " mt-0.5" : ""}`}
                    >
                      <Gift className="h-4 w-4 shrink-0" aria-hidden />
                      {signUpOffer}
                      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85">
                {page.trustBullets.map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-brand-amber" strokeWidth={2.5} aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {sections.partnerContact ? null : <PhotoBand exclude={page.heroPhoto} />}
        {sections.partnerContact ? null : <TransformSection pairs={examplePairs} onStart={() => startFree("hero")} />}
        {home && sections.occasions ? (
          <OccasionsSection current={intent} holidayOn={holiday != null} onStart={startFree} />
        ) : null}
        {sections.giftTiming ? <GiftTimingSection values={values} /> : null}

        {/* ------------------------------------------- how it works, book */}
        {sections.howItWorks && !sections.partnerContact ? <HowItWorks pair={page.hero} coverTitle={page.coverTitle} /> : null}
        {home && sections.finishedBook ? <FinishedBookSection values={values} coverTitle={page.coverTitle} /> : null}

        {/* Proof right after the explanation: real pages, out in the world. */}
        {sections.madeGallery ? <MadeGallery /> : null}

        {/* -------------------------------------------------- why, ideas */}
        <WhySection why={page.why} showBestPhotos={sections.bestPhotos} />
        {page.ideas ? <IdeasSection ideas={page.ideas} /> : null}
        {!home && sections.finishedBook ? <FinishedBookSection values={values} coverTitle={page.coverTitle} /> : null}
        {sections.partnerContact ? (
          <>
            <HowItWorks pair={page.hero} coverTitle={page.coverTitle} />
            <PartnerContactSection onInquiry={inquire} onStart={startFree} />
          </>
        ) : null}

        {/* -------------------------------------------------------- products */}
        {sections.products ? (
          <section className="v2-gutter-x mx-auto w-full max-w-7xl py-12 sm:py-16" aria-labelledby="products-title">
            <SectionHeading eyebrow={PRODUCTS.eyebrow} title={PRODUCTS.title} body={PRODUCTS.body} id="products-title" />
            <div
              className={cn(
                "mt-8 grid gap-4 sm:mt-10 md:gap-5",
                productItems.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2",
              )}
            >
              {productItems.map(({ icon, name, tagline, price, points, cta, note, featured, badge, visual }) => {
                const Icon = ICONS[icon];
                const priceText = fillCopy(price, values);
                const noteText = note ? fillCopy(note, values) : null;
                return (
                  <article
                    key={name}
                    className={cn(
                      "relative flex flex-col rounded-3xl border bg-white p-5 sm:p-6",
                      featured
                        ? "border-2 border-v2-primary shadow-[0_18px_48px_rgb(116_70_240/0.2)] md:-my-3"
                        : "border-v2-ink/10 shadow-[0_10px_30px_rgb(36_26_77/0.07)]",
                    )}
                  >
                    {badge ? (
                      <span className="absolute -top-3 left-5 z-10 rounded-full bg-brand-coral px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                        {badge}
                      </span>
                    ) : null}
                    <ProductVisual visual={visual} icon={Icon} featured={Boolean(featured)} coverTitle={page.coverTitle} />
                    <h3 className="v2-brand-title mt-5 text-2xl text-v2-ink">{name}</h3>
                    <p className="text-sm text-v2-muted">{tagline}</p>
                    {priceText ? <p className="mt-3 text-base font-bold text-v2-ink">{priceText}</p> : null}
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
          <section className="px-2 pb-2 sm:px-3 sm:pb-3" aria-labelledby="final-title">
            <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-v2-plum text-white lg:rounded-[2.25rem]">
              {finalPhoto ? (
                <div className="absolute inset-0">
                  <LifestyleImage id={finalPhoto} sizes="100vw" className="h-full w-full" />
                </div>
              ) : null}
              <div className="absolute inset-0 bg-[linear-gradient(to_top,rgb(36_26_77/0.92),rgb(36_26_77/0.7)_55%,rgb(36_26_77/0.45))]" aria-hidden />
              <div className="relative mx-auto max-w-2xl px-6 py-20 text-center sm:px-10 sm:py-28">
                <h2 id="final-title" className="v2-brand-title text-4xl sm:text-5xl">
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
            </div>
          </section>
        )}
      </main>

      <MarketingFooter stickyCta />

      {home && holiday ? <HolidayToast label={holiday.label} raised={!heroCtaVisible} /> : null}

      <ScrollToTopButton containerRef={scrollBoxRef} focusId="hero-title" />

      {/* Phone-only sticky CTA */}
      <div
        data-fab-avoid
        aria-hidden={heroCtaVisible}
        inert={heroCtaVisible}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-200 motion-reduce:transition-none lg:hidden",
          heroCtaVisible && "invisible translate-y-full",
        )}
      >
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

const STEP_COLORS = ["bg-brand-coral", "bg-brand-amber", "bg-brand-blue"] as const;

/** Three steps from photo to book, each with its own picture. Its #how anchor is the hero's secondary link. */
function HowItWorks({ pair, coverTitle }: { pair: HeroPair; coverTitle: string }) {
  const visuals = [<StepPhone key="phone" pair={pair} />, <StepPage key="page" pair={pair} />, <StepBook key="book" title={coverTitle} />];
  return (
    <section id="how" className="relative scroll-mt-20 overflow-hidden bg-v2-butter" aria-labelledby="how-title">
      <div className="v2-gutter-x relative mx-auto w-full max-w-7xl py-14 sm:py-20">
        <SectionHeading eyebrow={HOW_IT_WORKS.eyebrow} title={HOW_IT_WORKS.title} body={HOW_IT_WORKS.body} id="how-title" />
        <ol className="relative mt-10 grid gap-5 sm:mt-12 md:grid-cols-3 md:gap-8">
          {HOW_IT_WORKS.steps.map(({ title, body }, i) => (
            <li key={title} className="relative flex flex-col rounded-3xl bg-white p-5 shadow-[0_12px_32px_rgb(36_26_77/0.08)] sm:p-6">
              <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-v2-cream">{visuals[i]}</div>
              <div className="mt-5 flex items-center gap-3">
                <span
                  className={cn("v2-wordmark inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-white", STEP_COLORS[i % STEP_COLORS.length])}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <h3 className="text-lg font-semibold text-v2-ink">{title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-v2-muted">{body}</p>
              {i < HOW_IT_WORKS.steps.length - 1 ? (
                <span
                  className="absolute -right-6 top-24 z-10 hidden h-8 w-8 items-center justify-center rounded-full bg-v2-ink text-white shadow-md md:flex"
                  aria-hidden
                >
                  <ArrowRight className="h-4 w-4" />
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Step 1: the family photo on a phone screen. */
function StepPhone({ pair }: { pair: HeroPair }) {
  return (
    <div className="relative h-56 w-28 translate-y-10 rounded-[1.6rem] border-[5px] border-v2-ink bg-v2-ink shadow-lg" aria-hidden>
      <div className="absolute left-1/2 top-1.5 h-1.5 w-8 -translate-x-1/2 rounded-full bg-white/30" />
      <div className="absolute inset-x-0 top-5 overflow-hidden rounded-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pair.photoSrc}
          srcSet={marketingSrcSet(pair.photoSrc, pair.srcSetWidths, pair.width)}
          sizes="120px"
          alt=""
          width={pair.width}
          height={pair.height}
          loading="lazy"
          decoding="async"
          className="block aspect-[3/4] w-full object-cover"
        />
      </div>
      <span className="absolute inset-x-2 top-[8.5rem] rounded-full bg-v2-primary py-1 text-center text-[10px] font-bold text-white">Upload</span>
    </div>
  );
}

/** Step 2: the coloring page, with a crayon. */
function StepPage({ pair }: { pair: HeroPair }) {
  return (
    <div className="relative" aria-hidden>
      <div className="w-40 rotate-[-4deg] overflow-hidden rounded-lg border-4 border-white bg-white shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pair.sheetSrc}
          srcSet={marketingSrcSet(pair.sheetSrc, pair.srcSetWidths, pair.width)}
          sizes="160px"
          alt=""
          width={pair.width}
          height={pair.height}
          loading="lazy"
          decoding="async"
          style={{ aspectRatio: `${pair.width}/${pair.height}` }}
          className="block w-full object-cover"
        />
      </div>
    </div>
  );
}

/** Step 3: the printed book. */
function StepBook({ title }: { title: string }) {
  return (
    <div className="w-32" aria-hidden>
      <PrintedBook title={title} />
    </div>
  );
}

/** Real customer quotes from content/testimonials.ts. Renders nothing until there is one. */
function Testimonials() {
  if (TESTIMONIALS.length === 0) return null;
  return (
    <section className="border-y border-gray-200 bg-white">
      <div className="v2-gutter-x mx-auto w-full max-w-7xl py-12 sm:py-16">
        <SectionHeading eyebrow="From families" title="What families tell us" />
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

/**
 * The real before/after, big: drag between a family photo and the page made from it. With more than
 * one real pair on the page, a switcher swaps between them.
 */
function TransformSection({ pairs, onStart }: { pairs: HeroPair[]; onStart: () => void }) {
  const [index, setIndex] = useState(0);
  const pair = pairs[index] ?? pairs[0];
  const portrait = pair.height > pair.width;
  return (
    <section className="bg-white" aria-labelledby="transform-title">
      <div className="v2-gutter-x mx-auto grid w-full max-w-[90rem] gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:items-center lg:gap-16">
        <div>
          <SectionHeading align="left" eyebrow={TRANSFORM.eyebrow} title={TRANSFORM.title} body={TRANSFORM.body} id="transform-title" />
          {pairs.length > 1 ? (
            <div className="mt-6 inline-flex rounded-full bg-v2-cream p-1 ring-1 ring-v2-ink/10" role="group" aria-label="Example photos">
              {pairs.map((p, i) => (
                <button
                  key={p.photoSrc}
                  type="button"
                  aria-pressed={i === index}
                  onClick={() => setIndex(i)}
                  className={cn(
                    "min-h-11 rounded-full px-4 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary",
                    i === index ? "bg-v2-plum text-white shadow-sm" : "text-v2-navy hover:bg-white",
                  )}
                >
                  {p.label ?? `Example ${i + 1}`}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-6 rounded-2xl border-l-4 border-v2-primary bg-v2-primary-light p-4 sm:p-5">
            <p className="font-semibold text-v2-ink">{TRANSFORM.fixTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-v2-navy">{TRANSFORM.fixBody}</p>
          </div>
          <button type="button" onClick={onStart} className="v2-btn-primary mt-6 min-h-13 w-full px-7 text-base sm:w-auto">
            {PRIMARY_CTA}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className={cn("mx-auto w-full", portrait && "max-w-[30rem]")}>
          <CompareSlider key={pair.photoSrc} pair={pair} />
        </div>
      </div>
    </section>
  );
}

/** The picture at the top of a product card: a real coloring page, the printed book, or an icon. */
function ProductVisual({
  visual,
  icon: Icon,
  featured,
  coverTitle,
}: {
  visual: "page" | "book" | "story";
  icon: (typeof ICONS)[keyof typeof ICONS];
  featured: boolean;
  coverTitle: string;
}) {
  return (
    <div className={cn("relative flex h-40 items-center justify-center overflow-hidden rounded-2xl", featured ? "bg-v2-primary-light" : "bg-v2-cream")} aria-hidden>
      {visual === "page" ? (
        <div className="w-28 rotate-[-4deg] overflow-hidden rounded-md border-4 border-white bg-white shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marketing/boys-sheet.webp"
            srcSet={marketingSrcSet("/marketing/boys-sheet.webp", [240, 400, 800], 900)}
            sizes="112px"
            width={900}
            height={1200}
            alt=""
            loading="lazy"
            decoding="async"
            className="block aspect-[3/4] w-full object-cover object-top"
          />
        </div>
      ) : visual === "book" ? (
        <div className="w-28 translate-y-1">
          <PrintedBook title={coverTitle} />
        </div>
      ) : (
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-v2-primary shadow-sm">
          <Icon className="h-8 w-8" />
        </span>
      )}
    </div>
  );
}
