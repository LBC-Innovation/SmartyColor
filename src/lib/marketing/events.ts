import type { CtaLocation, CtaTarget, LandingIntent } from "@/content/marketing";
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
  cta_click: { location: CtaLocation; intent: TrackIntent; target?: CtaTarget };
  /** The partners page's email link was tapped or its address copied. Not a confirmed lead. */
  partner_inquiry: { location: "hero" | "final" };
  /** Answer to "How did you hear about us?" (a fixed option id, never free text). */
  heard_from: { answer: string };
  /** A share link was copied or sent. `method` is how; `content_type` is what. */
  share: { method: "copy" | "email" | "native" | "sms"; content_type: "page" | "referral" | "album" };
  // Book packages and design themes. Params are fixed ids and numbers; never the theme text, an
  // album name or a file name.
  package_viewed: { count: number; signed_in: boolean; intent: TrackIntent };
  package_selected: { format: TrackFormat; value: number; currency: string; from: "landing" | "wizard" };
  album_started: { mode: "pages" | "package" };
  package_pay_started: { format: TrackFormat; value: number; currency: string; method: "card" | "credit" };
  package_purchased: { format: TrackFormat; value: number; currency: string; method: "card" | "credit"; package_id: string };
  /** A book package was canceled and its unused value returned to the wallet. `value` is the refund. */
  package_refunded: { format: TrackFormat; value: number; currency: string; album_deleted: boolean };
  package_payment_canceled: { format: TrackFormat };
  package_payment_failed: { format: TrackFormat; reason: "declined" | "expired" | "unknown" };
  theme_set: { where: "wizard" | "settings"; source: "starter" | "typed" | "starter_edited"; starter_id?: ThemeStarterId };
  theme_skipped: { where: "wizard" };
  theme_removed: { where: "settings" };
  theme_rejected: { where: "wizard" | "settings" };
  package_extra_confirmed: { kind: "photos" | "touch_up"; count: number };
  package_binding_switched: { from: TrackFormat; to: TrackFormat };
};

export type TrackEvent = keyof TrackEventParams;

/** Fixed ids of the starter themes (never the customer's own words). */
export type ThemeStarterId = "superheroes" | "toy_bricks" | "under_sea" | "space" | "fairy_castle" | "dinosaurs";

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

/**
 * How each of our events is named on each platform. null = not sent there.
 * TikTok gets only its standard funnel events, so custom ones never train its optimization.
 * Google Ads gets only conversions whose label is configured (see GOOGLE_ADS_LABELS in track.ts).
 */
export const VENDOR_EVENT_NAMES: Record<
  TrackEvent,
  { ga4: string; meta: { name: string; custom: boolean }; pinterest: string | null; tiktok: string | null }
> = {
  page_generated: { ga4: "page_generated", meta: { name: "PageGenerated", custom: true }, pinterest: "custom", tiktok: "ViewContent" },
  sign_up: { ga4: "sign_up", meta: { name: "CompleteRegistration", custom: false }, pinterest: "signup", tiktok: "CompleteRegistration" },
  book_started: { ga4: "book_started", meta: { name: "AddToCart", custom: false }, pinterest: "addtocart", tiktok: "AddToCart" },
  checkout_started: { ga4: "begin_checkout", meta: { name: "InitiateCheckout", custom: false }, pinterest: null, tiktok: "InitiateCheckout" },
  purchase: { ga4: "purchase", meta: { name: "Purchase", custom: false }, pinterest: "checkout", tiktok: "CompletePayment" },
  // Custom on GA4 and Meta so they stay out of ad optimization; not sent to Pinterest or TikTok.
  cta_click: { ga4: "cta_click", meta: { name: "CtaClick", custom: true }, pinterest: null, tiktok: null },
  // A tap is intent, not a lead: custom events only, so it never trains ad optimization as a conversion.
  partner_inquiry: { ga4: "partner_contact_click", meta: { name: "PartnerContactClick", custom: true }, pinterest: null, tiktok: null },
  // Self-reported source after sign-up: analytics only.
  heard_from: { ga4: "heard_from", meta: { name: "HeardFrom", custom: true }, pinterest: null, tiktok: null },
  // Someone shared a page or their referral link.
  share: { ga4: "share", meta: { name: "Share", custom: true }, pinterest: null, tiktok: null },
  package_viewed: { ga4: "package_viewed", meta: { name: "ViewContent", custom: false }, pinterest: null, tiktok: "ViewContent" },
  package_selected: { ga4: "package_selected", meta: { name: "PackageSelected", custom: true }, pinterest: null, tiktok: null },
  album_started: { ga4: "album_started", meta: { name: "AlbumStarted", custom: true }, pinterest: null, tiktok: null },
  package_pay_started: { ga4: "begin_checkout", meta: { name: "InitiateCheckout", custom: false }, pinterest: null, tiktok: "InitiateCheckout" },
  // Open question (Q8): custom for now, so the later book order stays the platforms' only Purchase.
  package_purchased: { ga4: "package_purchased", meta: { name: "PackagePurchased", custom: true }, pinterest: null, tiktok: null },
  package_refunded: { ga4: "package_refunded", meta: { name: "PackageRefunded", custom: true }, pinterest: null, tiktok: null },
  package_payment_canceled: { ga4: "package_payment_canceled", meta: { name: "PackagePaymentCanceled", custom: true }, pinterest: null, tiktok: null },
  package_payment_failed: { ga4: "package_payment_failed", meta: { name: "PackagePaymentFailed", custom: true }, pinterest: null, tiktok: null },
  theme_set: { ga4: "theme_set", meta: { name: "ThemeSet", custom: true }, pinterest: null, tiktok: null },
  theme_skipped: { ga4: "theme_skipped", meta: { name: "ThemeSkipped", custom: true }, pinterest: null, tiktok: null },
  theme_removed: { ga4: "theme_removed", meta: { name: "ThemeRemoved", custom: true }, pinterest: null, tiktok: null },
  theme_rejected: { ga4: "theme_rejected", meta: { name: "ThemeRejected", custom: true }, pinterest: null, tiktok: null },
  package_extra_confirmed: { ga4: "package_extra_confirmed", meta: { name: "PackageExtraConfirmed", custom: true }, pinterest: null, tiktok: null },
  package_binding_switched: { ga4: "package_binding_switched", meta: { name: "PackageBindingSwitched", custom: true }, pinterest: null, tiktok: null },
};

/** Cookie set by "Do not sell or share my personal information". Honored in the browser and on the server. */
export const AD_OPT_OUT_COOKIE = "cm_ads_optout";
