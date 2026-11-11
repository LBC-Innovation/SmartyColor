import type { CtaLocation, LandingIntent } from "@/content/marketing";
import { bindingIdForProduct, DIGITAL_FORMAT, type BookFormatId } from "@/lib/print/bookBindings";

/**
 * The only events sent to analytics and ad platforms, and the only params each may carry.
 * Never add photos, page images, album names, captions or anyone's name here.
 */
export type TrackFormat = "stapled" | "paperback" | "spiral" | "digital";

/** The landing page the visit started from ("default" for the homepage or anything unknown). */
export type TrackIntent = LandingIntent;

export type TrackEventParams = {
  page_generated: { is_first: boolean; signed_in: boolean; intent: TrackIntent };
  sign_up: { method: string };
  book_started: { format: TrackFormat; intent: TrackIntent };
  checkout_started: { value: number; currency: string; page_count: number; format: TrackFormat; is_gift: boolean };
  purchase: { value: number; currency: string; order_id: string; format: TrackFormat; is_gift: boolean; intent: TrackIntent };
  /** A tap on a marketing call to action, or the studio's "Turn this into a book" card. */
  cta_click: { location: CtaLocation; intent: TrackIntent };
  /** The partners page's email link was tapped or its address copied. Not a confirmed lead. */
  partner_inquiry: { location: "hero" | "final" };
};

export type TrackEvent = keyof TrackEventParams;

const FORMAT_FOR_BINDING: Record<BookFormatId, TrackFormat> = {
  saddle_stitch: "stapled",
  perfect_bound: "paperback",
  coil_bound: "spiral",
  digital: "digital",
};

export function trackFormat(id: BookFormatId): TrackFormat {
  return FORMAT_FOR_BINDING[id];
}

/** Format of an order from its product id (paperback if the product is unknown). */
export function trackFormatForProduct(productId: string): TrackFormat {
  if (productId === DIGITAL_FORMAT.productId) return "digital";
  const bindingId = bindingIdForProduct(productId);
  return bindingId ? trackFormat(bindingId) : "paperback";
}

/** Whole cents to the decimal amount ad platforms expect. */
export function centsToValue(cents: number): number {
  return Math.round(cents) / 100;
}

/** How each of our events is named on each platform. null = not sent there. */
export const VENDOR_EVENT_NAMES: Record<
  TrackEvent,
  { ga4: string; meta: { name: string; custom: boolean }; pinterest: string | null }
> = {
  page_generated: { ga4: "page_generated", meta: { name: "PageGenerated", custom: true }, pinterest: "custom" },
  sign_up: { ga4: "sign_up", meta: { name: "CompleteRegistration", custom: false }, pinterest: "signup" },
  book_started: { ga4: "book_started", meta: { name: "AddToCart", custom: false }, pinterest: "addtocart" },
  checkout_started: { ga4: "begin_checkout", meta: { name: "InitiateCheckout", custom: false }, pinterest: null },
  purchase: { ga4: "purchase", meta: { name: "Purchase", custom: false }, pinterest: "checkout" },
  // Custom on GA4 and Meta so they stay out of ad optimization; not sent to Pinterest.
  cta_click: { ga4: "cta_click", meta: { name: "CtaClick", custom: true }, pinterest: null },
  // A tap is intent, not a lead: custom events only, so it never trains ad optimization as a conversion.
  partner_inquiry: { ga4: "partner_contact_click", meta: { name: "PartnerContactClick", custom: true }, pinterest: null },
};

/** Cookie set by "Do not sell or share my personal information". Honored in the browser and on the server. */
export const AD_OPT_OUT_COOKIE = "cm_ads_optout";
