"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Download, Gift, X } from "lucide-react";
import {
  BEST_PHOTOS,
  CONTACT_EMAIL,
  LIFESTYLE_PHOTOS,
  PHOTO_BAND,
  FINISHED_BOOK,
  GIFT_TIMING,
  HOLIDAY_BLOCK,
  LANDING_GIFT_STRIP,
  LANDING_PAGES,
  OCCASIONS,
  PARTNER_CONTACT,
  PRICE_LINE,
  PRIMARY_CTA,
  PRODUCT_PHOTOS,
  REASSURANCE,
  type CtaLocation,
  type IdeasBlock,
  type LandingIntent,
  type LifestyleId,
  type WhyBlock,
} from "@/content/marketing";
import { fillCopy, type CopyValues } from "@/lib/marketing/copy";
import { trackCta } from "@/lib/track";
import { BINDING_PHOTOS, BLANK_BACKS_DEFAULT, BOOK_BINDINGS, DIGITAL_FORMAT, withBlankBacks, type BookBindingId } from "@/lib/print/bookBindings";
import { cn } from "@/lib/cn";
import { BeforeAfter, ICONS, LifestyleImage, PrintedBook, SectionHeading, readyLifestyle } from "@/components/v2/marketing/landingParts";

/** Starts the free-page flow. `target` is the landing page whose promise the visitor is following. */
export type StartFree = (location: CtaLocation, target?: LandingIntent) => void;

export const PARTNER_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(PARTNER_CONTACT.subject)}`;

const HOLIDAY_TOAST_KEY = "cm-holiday-toast-dismissed";

/**
 * Homepage toast while the Christmas order-by date is set: slides up at the bottom center a moment
 * after load, and stays closed for the rest of the visit once dismissed. `raised` lifts it above the
 * phone's sticky button while that button is showing.
 */
export function HolidayToast({ label, raised }: { label: string; raised: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(HOLIDAY_TOAST_KEY) === "1";
    } catch {
      /* storage blocked: show it, it can still be closed */
    }
    if (dismissed) return;
    const timer = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  const line = fillCopy(HOLIDAY_BLOCK.line, { date: label });
  if (!open || !line) return null;
  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(HOLIDAY_TOAST_KEY, "1");
    } catch {
      /* fine: it just shows again next visit */
    }
  };
  return (
    <aside
      aria-label={HOLIDAY_BLOCK.title}
      data-fab-avoid
      className={cn(
        "cm-toast-in fixed inset-x-3 z-50 mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-v2-primary/25 bg-white py-2.5 pl-3 pr-1.5 text-v2-ink shadow-[0_18px_48px_rgb(36_26_77/0.3)] transition-[bottom] duration-200 motion-reduce:transition-none sm:gap-4 sm:py-3 sm:pl-4",
        raised ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6" : "bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6",
      )}
    >
      <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-v2-primary text-white sm:inline-flex">
        <Gift className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{HOLIDAY_BLOCK.title}</p>
        <p className="mt-0.5 text-sm text-v2-navy">{line}</p>
        {/* phone: the link sits under the text */}
        <Link
          href={HOLIDAY_BLOCK.href}
          onClick={close}
          className="-mb-1 inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-v2-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary sm:hidden"
        >
          {HOLIDAY_BLOCK.link}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      {/* tablet and up: a real button beside the text */}
      <Link href={HOLIDAY_BLOCK.href} onClick={close} className="v2-btn-primary hidden min-h-11 shrink-0 px-5 text-sm sm:inline-flex">
        {HOLIDAY_BLOCK.link}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
      <button
        type="button"
        onClick={close}
        aria-label={HOLIDAY_BLOCK.dismiss}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full text-v2-navy hover:bg-black/5 hover:text-v2-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-primary sm:self-center"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </aside>
  );
}

/**
 * The occasion cards' image width for srcset. The row holds 2 to 4 cards on a desktop, so the hint
 * follows the column count; a fixed small width made the browser stretch the 400px file in a
 * two-card row. The row is capped at max-w-7xl (1280px).
 */
function occasionImageSizes(count: number): string {
  const cols = count >= 4 ? 4 : count === 3 ? 3 : 2;
  return `(min-width: 1280px) ${Math.round(1280 / cols)}px, (min-width: 1024px) ${Math.round(100 / cols)}vw, (min-width: 640px) 50vw, 100vw`;
}

/** Cards that link each occasion's landing page. The current page and pages that are not ready are left out. */
export function OccasionsSection({
  current,
  holidayOn,
  onStart,
}: {
  current: LandingIntent;
  holidayOn: boolean;
  onStart: StartFree;
}) {
  const cards = OCCASIONS.cards.filter((c) => c.intent !== current && LANDING_PAGES[c.intent].ready);
  // Occasions without a ready page of their own are named in plain text instead.
  const others = OCCASIONS.others.filter((o) => !o.intent || !LANDING_PAGES[o.intent].ready).map((o) => o.label);
  const othersLine =
    others.length > 1
      ? `${OCCASIONS.othersLead} ${others.slice(0, -1).join(", ")}, and ${others[others.length - 1]}.`
      : others.length === 1
        ? `${OCCASIONS.othersLead} ${others[0]}.`
        : null;
  return (
    <section className="v2-gutter-x mx-auto w-full max-w-7xl py-12 sm:py-16" aria-labelledby="occasions-title">
      <SectionHeading eyebrow={OCCASIONS.eyebrow} title={OCCASIONS.title} id="occasions-title" />
      <ul
        className={cn(
          "mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2",
          cards.length >= 4 ? "lg:grid-cols-4" : cards.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2",
        )}
      >
        {cards.map((card) => {
          const Icon = ICONS[card.icon];
          const title = holidayOn && "holidayTitle" in card && card.holidayTitle ? card.holidayTitle : card.title;
          const page = LANDING_PAGES[card.intent];
          const linkOnly = "link" in card && card.link;
          const image = "image" in card && card.image && LIFESTYLE_PHOTOS[card.image].ready ? card.image : null;
          return (
            <li
              key={card.intent}
              className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-v2-ink/10 bg-white shadow-[0_10px_30px_rgb(36_26_77/0.07)]"
            >
              {image ? (
                <LifestyleImage id={image} sizes={occasionImageSizes(cards.length)} className="aspect-[3/2] w-full" />
              ) : null}
              <div className="flex flex-1 flex-col p-5">
                {image ? null : (
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-v2-primary-light text-v2-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                )}
                <h3 className={cn("text-lg font-semibold text-v2-ink", !image && "mt-4")}>
                  <Link
                    href={page.path}
                    className="inline-flex min-h-11 items-center gap-1.5 text-v2-link underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
                  >
                    {title}
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                  </Link>
                </h3>
                <p className="flex-1 text-sm leading-relaxed text-v2-muted">{card.body}</p>
                {linkOnly ? (
                  <Link
                    href={page.path}
                    onClick={() => trackCta("occasion", card.intent)}
                    className="v2-btn-outline mt-5 min-h-11 w-full px-3 text-center text-sm"
                  >
                    {card.link}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStart("occasion", card.intent)}
                    aria-label={`${PRIMARY_CTA}: ${title}`}
                    className="v2-btn-outline mt-5 min-h-11 w-full px-3 text-center text-sm"
                  >
                    {PRIMARY_CTA}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {current === "default" && othersLine ? <p className="mt-5 text-center text-sm text-v2-muted">{othersLine}</p> : null}
    </section>
  );
}

const PRINT_ORDER: BookBindingId[] = ["saddle_stitch", "coil_bound", "perfect_bound"];

/**
 * "See the finished book": real photos when PRODUCT_PHOTOS has entries, otherwise the CSS mock,
 * and always the formats in words, read from the binding config.
 */
export function FinishedBookSection({ values, coverTitle }: { values: CopyValues; coverTitle: string }) {
  const priceLine = fillCopy(PRICE_LINE, values);
  const pdfPrice = fillCopy(FINISHED_BOOK.digital.price, values);
  return (
    <section aria-labelledby="finished-title">
      <div className="v2-gutter-x mx-auto w-full max-w-7xl py-12 sm:py-16">
        <SectionHeading
          eyebrow={FINISHED_BOOK.eyebrow}
          title={FINISHED_BOOK.title}
          body={FINISHED_BOOK.body}
          id="finished-title"
        />
        <div className="mt-8 grid gap-8 sm:mt-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12">
          {PRODUCT_PHOTOS.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3">
              {PRODUCT_PHOTOS.map((photo) => (
                <li key={photo.src}>
                  <figure className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.src}
                      width={photo.width}
                      height={photo.height}
                      alt={photo.alt}
                      style={{ aspectRatio: `${photo.width}/${photo.height}` }}
                      className="block h-auto w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <figcaption className="px-3 py-2 text-xs font-semibold text-v2-muted">{photo.caption}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          ) : (
            <figure className="flex flex-col items-center rounded-2xl border border-gray-200 bg-white px-6 py-10">
              <div className="w-28 scale-125 sm:w-40 sm:scale-150 sm:py-6">
                <PrintedBook title={coverTitle} />
              </div>
              <figcaption className="mt-6 text-center text-xs font-semibold text-v2-muted">
                {FINISHED_BOOK.mockCaption}
              </figcaption>
            </figure>
          )}

          <div>
            <h3 className="text-lg font-semibold text-v2-ink">{FINISHED_BOOK.formatsTitle}</h3>
            <ul className="mt-3 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
              {PRINT_ORDER.map((id) => {
                const b = withBlankBacks(BOOK_BINDINGS[id], BLANK_BACKS_DEFAULT);
                const pages = fillCopy(FINISHED_BOOK.pages, { min: String(b.minPages), max: String(b.maxPages) });
                const photo = BINDING_PHOTOS[id];
                return (
                  <li key={id} className="flex items-center gap-4 px-4 py-3.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.src}
                      width={photo.width}
                      height={photo.height}
                      alt={photo.alt}
                      className="aspect-video w-24 shrink-0 rounded-lg border border-gray-200 object-cover sm:w-32"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-semibold text-v2-ink">{b.shortLabel}</span>
                        {pages ? <span className="text-xs font-semibold text-v2-link">{pages}</span> : null}
                      </p>
                      <p className="mt-0.5 text-sm text-v2-muted">{b.blurb}</p>
                    </div>
                  </li>
                );
              })}
              <li className="flex items-center gap-4 px-4 py-3.5">
                <span
                  className="flex aspect-video w-24 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-v2-primary-light text-v2-primary sm:w-32"
                  aria-hidden
                >
                  <Download className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold text-v2-ink">{DIGITAL_FORMAT.shortLabel}</span>
                    <span className="text-xs font-semibold text-v2-link">{FINISHED_BOOK.digital.pages}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-v2-muted">{FINISHED_BOOK.digital.body}</p>
                  {pdfPrice ? <p className="mt-1 text-sm font-semibold text-v2-navy">{pdfPrice}</p> : null}
                </div>
              </li>
            </ul>
            <p className="mt-3 text-sm text-v2-muted">{FINISHED_BOOK.sizeNote}</p>
            {priceLine ? <p className="mt-1 text-sm font-semibold text-v2-navy">{priceLine}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** "Before you order": true statements about price, printing and proofing, and the contact email. */
export function ReassuranceStrip() {
  return (
    <section aria-label={REASSURANCE.title} className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 sm:mt-8 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-v2-muted">{REASSURANCE.title}</p>
      <ul className="mt-3 grid gap-2.5 text-sm text-v2-navy sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3">
        {REASSURANCE.items.map(({ icon, text }) => {
          const Icon = ICONS[icon];
          return (
            <li key={text} className="flex items-start gap-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-v2-success-bg text-v2-success-text">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="pt-1 font-semibold">{text}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-v2-muted">
        {REASSURANCE.contactLead}{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex min-h-11 items-center font-semibold text-v2-link underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
        >
          {CONTACT_EMAIL}
        </a>
      </p>
    </section>
  );
}

/**
 * The "why" block: an edge-to-edge split, a lifestyle photo on one half and the pitch on deep plum on
 * the other. Until the photo is ready, the real before/after takes the photo's half.
 */
export function WhySection({
  why,
  showBestPhotos,
  plain = false,
}: {
  why: WhyBlock;
  showBestPhotos: boolean;
  /** Cream instead of plum, and only the points: no use-case pills, no photo tips (the gift page). */
  plain?: boolean;
}) {
  const photo = why.photo && LIFESTYLE_PHOTOS[why.photo].ready ? why.photo : null;
  const dark = !plain;
  return (
    <section className="px-2 sm:px-3" aria-labelledby="why-title">
      <div className={cn("grid overflow-hidden rounded-[1.75rem] lg:grid-cols-2 lg:rounded-[2.25rem]", dark ? "bg-v2-plum text-white" : "bg-v2-butter text-v2-ink")}>
        {photo ? (
          <LifestyleImage id={photo} sizes="(min-width: 1024px) 50vw, 100vw" className="aspect-[3/2] w-full lg:aspect-auto lg:h-full lg:min-h-[44rem]" />
        ) : (
          <div className={cn("flex items-center justify-center px-5 py-12 sm:px-10", dark ? "bg-white/[0.06]" : "bg-white/50")}>
            <BeforeAfter className="w-full max-w-sm" pair={why.example} />
          </div>
        )}
        <div className="flex flex-col justify-center px-5 py-14 sm:px-10 sm:py-20 lg:px-16 xl:px-20">
          <SectionHeading align="left" tone={dark ? "dark" : "light"} eyebrow={plain ? undefined : why.eyebrow} title={why.title} body={why.body} id="why-title" />
          <ul className="mt-8 space-y-5">
            {why.points.map(({ icon, title, body }) => {
              const Icon = ICONS[icon];
              return (
                <li key={title} className="flex gap-4">
                  <span className={cn("mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", dark ? "bg-white/10 text-brand-amber" : "bg-white text-v2-primary")}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span>
                    <span className={cn("block font-semibold", dark ? "text-white" : "text-v2-ink")}>{title}</span>
                    <span className={cn("block text-sm leading-relaxed", dark ? "text-white/75" : "text-v2-muted")}>{body}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {plain ? null : (
            <>
              <p className="mt-8 text-xs font-bold uppercase tracking-wider text-white/70">{why.useCasesTitle}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {why.useCases.map((u) => (
                  <li key={u} className="rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white">
                    {u}
                  </li>
                ))}
              </ul>
            </>
          )}
          {showBestPhotos && !plain ? (
            <div className="mt-8 rounded-2xl bg-white p-4 text-v2-ink">
              <p className="text-xs font-bold uppercase tracking-wider text-v2-muted">{BEST_PHOTOS.title}</p>
              <ul className="mt-2 space-y-1.5 text-sm text-v2-navy">
                {BEST_PHOTOS.items.map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Three ideas (party uses, pet ideas, partner examples). */
export function IdeasSection({ ideas }: { ideas: IdeasBlock }) {
  return (
    <section className="v2-gutter-x mx-auto w-full max-w-7xl py-12 sm:py-16" aria-labelledby="ideas-title">
      <SectionHeading eyebrow={ideas.eyebrow} title={ideas.title} body={ideas.body} id="ideas-title" />
      <ul className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-3 md:gap-6">
        {ideas.items.map(({ icon, title, body }) => {
          const Icon = ICONS[icon];
          return (
            <li key={title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-v2-primary-light text-v2-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-v2-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-v2-muted">{body}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Gift page timing. The first card reads right with or without an order-by date (the date only
 * exists while it is still ahead); the second is the honest last-minute option, always there.
 */
export function GiftTimingSection({ values }: { values: CopyValues }) {
  const dated = fillCopy(GIFT_TIMING.withDate.title, values);
  const first = dated
    ? { title: dated, body: GIFT_TIMING.withDate.body }
    : { title: GIFT_TIMING.withoutDate.title, body: GIFT_TIMING.withoutDate.body };
  const pdfBody = fillCopy(GIFT_TIMING.pdf.bodyWithPrice, values) ?? GIFT_TIMING.pdf.body;
  const cards = [first, { title: GIFT_TIMING.pdf.title, body: pdfBody }];
  return (
    <section className="v2-gutter-x mx-auto w-full max-w-7xl py-8 sm:py-12" aria-label="Timing">
      <ul className="grid gap-4 md:grid-cols-2 md:gap-6">
        {cards.map((c, i) => (
          <li
            key={c.title}
            className={cn(
              "rounded-2xl border p-5 sm:p-6",
              i === 0 ? "border-v2-primary/25 bg-v2-primary-light" : "border-gray-200 bg-white",
            )}
          >
            <h2 className="text-lg font-semibold text-v2-ink">{c.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-v2-navy">{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The contact address as plain, selectable text with a Copy button, for in-app browsers that ignore
 * mailto links. `onCopy` reports the tap; the button announces "Copied" to screen readers.
 */
export function CopyEmail({ onCopy, className }: { onCopy?: () => void; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    onCopy?.();
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* the address is selectable text */
    }
  }
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 text-sm text-v2-muted", className)}>
      <span>{PARTNER_CONTACT.emailLabel}</span>
      <span className="select-all font-semibold text-v2-ink [overflow-wrap:anywhere]">{CONTACT_EMAIL}</span>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-semibold text-v2-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {copied ? PARTNER_CONTACT.copied : PARTNER_CONTACT.copy}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? PARTNER_CONTACT.copied : ""}
      </span>
    </p>
  );
}

/** The partners page's contact block: an email link with a prefilled subject, the address, and the free page. */
export function PartnerContactSection({ onInquiry, onStart }: { onInquiry: (location: "hero" | "final") => void; onStart: StartFree }) {
  return (
    <section id="contact" className="v2-gutter-x mx-auto w-full max-w-3xl scroll-mt-4 py-12 sm:py-16" aria-labelledby="contact-title">
      <div className="rounded-3xl border border-v2-primary/25 bg-v2-primary-light p-6 text-center sm:p-10">
        <p className="text-xs font-bold uppercase tracking-wider text-v2-primary">{PARTNER_CONTACT.eyebrow}</p>
        <h2 id="contact-title" className="v2-brand-title mt-2 text-3xl text-v2-ink sm:text-4xl">
          {PARTNER_CONTACT.title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-v2-navy sm:text-base">{PARTNER_CONTACT.body}</p>
        <div className="mx-auto mt-5 max-w-md rounded-xl bg-white p-4 text-left shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-v2-muted">{PARTNER_CONTACT.askTitle}</p>
          <ul className="mt-2 space-y-1.5 text-sm text-v2-navy">
            {PARTNER_CONTACT.asks.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <a href={PARTNER_MAILTO} onClick={() => onInquiry("final")} className="v2-btn-primary min-h-13 px-7 text-center text-base">
            {PARTNER_CONTACT.cta}
          </a>
          <button
            type="button"
            onClick={() => onStart("final", "partners")}
            aria-label={`${PARTNER_CONTACT.secondary}: for yourself first`}
            className="v2-btn-outline min-h-13 px-7 text-center text-base"
          >
            {PARTNER_CONTACT.secondary}
          </button>
        </div>
        <CopyEmail className="mt-3 justify-center" onCopy={() => onInquiry("final")} />
      </div>
    </section>
  );
}

/**
 * An edge-to-edge strip of lifestyle photos: the "people" moment of the page. The page's own hero
 * photo is left out. Shows once at least three are ready; on a phone it scrolls sideways.
 */
export function PhotoBand({ exclude, surface = false }: { exclude?: LifestyleId; surface?: boolean }) {
  const ids = readyLifestyle(PHOTO_BAND.ids.filter((id) => id !== exclude));
  if (ids.length < 3) return null;
  return (
    <section className={cn("py-14 sm:py-20", surface && "bg-white")} aria-labelledby="band-title">
      <div className="v2-gutter-x mx-auto w-full max-w-7xl">
        <SectionHeading title={PHOTO_BAND.title} id="band-title" />
      </div>
      <ul
        className="mt-10 flex snap-x snap-mandatory gap-2 overflow-x-auto px-2 pb-1 sm:mt-12 sm:gap-3 sm:px-3 lg:grid lg:overflow-visible lg:pb-0"
        style={{ gridTemplateColumns: `repeat(${ids.length}, minmax(0, 1fr))` }}
      >
        {ids.map((id) => (
          <li key={id} className="w-[80%] shrink-0 snap-center sm:w-[46%] lg:w-auto">
            <LifestyleImage
              id={id}
              caption
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 46vw, 80vw"
              className="aspect-[4/5] w-full rounded-2xl sm:rounded-3xl"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The homepage's gift strip: one row (photo, a line, a link) that sends gift buyers to /gift. It
 * replaces the old occasion cards, so there is no card grid and no second pitch on the page.
 */
export function GiftStrip({ values }: { values: CopyValues }) {
  const body = fillCopy(LANDING_GIFT_STRIP.body, values);
  const photo = LIFESTYLE_PHOTOS["kitchen-table"].ready ? "kitchen-table" : null;
  return (
    <section className="v2-gutter-x mx-auto w-full max-w-5xl py-14 sm:py-20" aria-labelledby="gift-strip-title">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        {photo ? (
          <LifestyleImage id={photo} sizes="(min-width: 1024px) 256px, 100vw" className="aspect-[3/2] w-full rounded-2xl lg:w-64 lg:shrink-0" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 id="gift-strip-title" className="v2-brand-title text-2xl text-v2-ink sm:text-3xl">
            {LANDING_GIFT_STRIP.title}
          </h2>
          {body ? <p className="mt-2 text-sm text-v2-muted sm:text-base">{body}</p> : null}
        </div>
        <Link
          href={LANDING_GIFT_STRIP.href}
          onClick={() => trackCta("occasion", "gift")}
          className="v2-btn-outline min-h-11 w-full shrink-0 px-6 text-center lg:w-auto"
        >
          {LANDING_GIFT_STRIP.link}
        </Link>
      </div>
    </section>
  );
}
