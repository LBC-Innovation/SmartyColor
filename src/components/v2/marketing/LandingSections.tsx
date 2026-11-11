"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy } from "lucide-react";
import {
  BEST_PHOTOS,
  CONTACT_EMAIL,
  FINISHED_BOOK,
  GIFT_TIMING,
  HOLIDAY_BLOCK,
  HOLIDAY_LINE,
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
  type WhyBlock,
} from "@/content/marketing";
import { fillCopy, type CopyValues } from "@/lib/marketing/copy";
import { trackCta } from "@/lib/track";
import { BOOK_BINDINGS, DIGITAL_FORMAT, type BookBindingId } from "@/lib/print/bookBindings";
import { cn } from "@/lib/cn";
import { BeforeAfter, ICONS, PrintedBook, SectionHeading } from "@/components/v2/marketing/landingParts";

/** Starts the free-page flow. `target` is the landing page whose promise the visitor is following. */
export type StartFree = (location: CtaLocation, target?: LandingIntent) => void;

export const PARTNER_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(PARTNER_CONTACT.subject)}`;

/** Homepage block under the hero while the Christmas order-by date is set: the page's one in-page date. */
export function HolidayBlock({ label }: { label: string }) {
  const line = fillCopy(HOLIDAY_LINE, { date: label });
  return (
    <section className="v2-gutter-x mx-auto w-full max-w-6xl pb-2 sm:pb-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-v2-primary/20 bg-v2-primary-light p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-v2-ink">{HOLIDAY_BLOCK.title}</h2>
          <p className="mt-0.5 text-sm text-v2-navy">{HOLIDAY_BLOCK.body}</p>
          <p className="mt-1 text-sm font-semibold text-v2-link">
            {line} {HOLIDAY_BLOCK.note}
          </p>
        </div>
        <Link
          href={HOLIDAY_BLOCK.href}
          className="v2-btn-outline h-11 shrink-0 bg-white px-5 text-sm"
        >
          {HOLIDAY_BLOCK.link}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
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
    <section className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16" aria-labelledby="occasions-title">
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
          return (
            <li key={card.intent} className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-v2-primary-light text-v2-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-v2-ink">
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
      <div className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16">
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
                const b = BOOK_BINDINGS[id];
                const pages = fillCopy(FINISHED_BOOK.pages, { min: String(b.minPages), max: String(b.maxPages) });
                return (
                  <li key={id} className="px-4 py-3.5">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold text-v2-ink">{b.shortLabel}</span>
                      {pages ? <span className="text-xs font-semibold text-v2-link">{pages}</span> : null}
                    </p>
                    <p className="mt-0.5 text-sm text-v2-muted">{b.blurb}</p>
                  </li>
                );
              })}
              <li className="px-4 py-3.5">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold text-v2-ink">{DIGITAL_FORMAT.shortLabel}</span>
                  <span className="text-xs font-semibold text-v2-link">{FINISHED_BOOK.digital.pages}</span>
                </p>
                <p className="mt-0.5 text-sm text-v2-muted">{FINISHED_BOOK.digital.body}</p>
                {pdfPrice ? <p className="mt-1 text-sm font-semibold text-v2-navy">{pdfPrice}</p> : null}
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

/** The "why" block: a pitch, three points, a real before/after, and chips. */
export function WhySection({ why, showBestPhotos }: { why: WhyBlock; showBestPhotos: boolean }) {
  return (
    <section className="border-y border-gray-200 bg-white" aria-labelledby="why-title">
      <div className="v2-gutter-x mx-auto grid w-full max-w-6xl gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading align="left" eyebrow={why.eyebrow} title={why.title} body={why.body} id="why-title" />
          <ul className="mt-7 space-y-4">
            {why.points.map(({ icon, title, body }) => {
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
          <BeforeAfter className="mx-auto mb-6 max-w-sm" pair={why.example} />
          <p className="text-xs font-bold uppercase tracking-wider text-v2-muted">{why.useCasesTitle}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {why.useCases.map((u) => (
              <li
                key={u}
                className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-v2-navy"
              >
                {u}
              </li>
            ))}
          </ul>
          {showBestPhotos ? (
            <div className="mt-6 rounded-xl bg-white p-4 shadow-sm">
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
    <section className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16" aria-labelledby="ideas-title">
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
    <section className="v2-gutter-x mx-auto w-full max-w-6xl py-8 sm:py-12" aria-label="Timing">
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
