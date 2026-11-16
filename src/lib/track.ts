import type { CtaLocation } from "@/content/marketing";
import { readCookieFromHeader } from "@/lib/marketing/attribution";
import { intentFromAttributionCookie, readTrackIntent } from "@/lib/marketing/copy";
import {
  AD_OPT_OUT_COOKIE,
  VENDOR_EVENT_NAMES,
  type TrackEvent,
  type TrackEventParams,
} from "@/lib/marketing/events";

/**
 * The one place the app talks to GA4, Google Ads, Meta Pixel, the TikTok pixel and the Pinterest
 * tag. Components call `track()`; nothing else calls gtag, fbq, ttq or pintrk. Every call is a no-op when the visitor has
 * opted out, sends Global Privacy Control, or the vendor's id isn't configured.
 */

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown };
type Pintrk = (...args: unknown[]) => void;
type Ttq = {
  track: (event: string, props?: Record<string, unknown>, options?: Record<string, unknown>) => void;
  page: () => void;
  revokeConsent?: () => void;
};

declare global {
  interface Window {
    gtag?: Gtag;
    fbq?: Fbq;
    pintrk?: Pintrk;
    ttq?: Ttq;
  }
}

const ID_PATTERN = /^[A-Za-z0-9-]{3,40}$/;

function cleanId(value: string | undefined): string | null {
  const v = value?.trim();
  return v && ID_PATTERN.test(v) ? v : null;
}

export const TRACKING_IDS = {
  ga4: cleanId(process.env.NEXT_PUBLIC_GA4_ID),
  /** Google Ads tag id, "AW-123456789". */
  googleAds: cleanId(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID),
  meta: cleanId(process.env.NEXT_PUBLIC_META_PIXEL_ID),
  tiktok: cleanId(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID),
  pinterest: cleanId(process.env.NEXT_PUBLIC_PINTEREST_TAG_ID),
};

const LABEL_PATTERN = /^[A-Za-z0-9_-]{3,60}$/;
function cleanLabel(value: string | undefined): string | null {
  const v = value?.trim();
  return v && LABEL_PATTERN.test(v) ? v : null;
}

/** Google Ads conversion action labels (the part after "AW-…/" in a conversion's event snippet). */
const GOOGLE_ADS_LABELS: Partial<Record<TrackEvent, string | null>> = {
  purchase: cleanLabel(process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL),
  sign_up: cleanLabel(process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL),
};

export function anyTrackerConfigured(): boolean {
  const { ga4, googleAds, meta, tiktok, pinterest } = TRACKING_IDS;
  return Boolean(ga4 || googleAds || meta || tiktok || pinterest);
}

/**
 * Consent Mode v2 regions where storage is denied by default: the EEA, the UK and Switzerland.
 * There is no consent banner, so Google tags there run cookieless and ads aren't personalized.
 */
const CONSENT_REQUIRED_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
];

/** Pages where only a page view is sent: sign-in, sign-up, password reset and account settings. */
const PAGE_VIEW_ONLY_PREFIXES = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/account", "/auth"];

export function isPageViewOnlyPath(pathname: string): boolean {
  return PAGE_VIEW_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** URL bits that may hold a sign-in secret (email confirmation, password reset, OAuth code). */
const SECRET_URL_KEYS = ["access_token", "refresh_token", "token", "token_hash", "code", "type"];

export function urlHasSecrets(): boolean {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  // A purchase code pays for a book, so its redeem link (or a sign-in page returning to it) is a secret too.
  if (window.location.pathname.startsWith("/redeem/") || query.get("next")?.startsWith("/redeem/")) return true;
  return SECRET_URL_KEYS.some((k) => query.has(k) || hash.has(k));
}

export function hasOptedOut(): boolean {
  if (typeof document === "undefined") return true;
  if (readCookieFromHeader(document.cookie, AD_OPT_OUT_COOKIE) === "1") return true;
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  return gpc === true;
}

export function setAdOptOut(optedOut: boolean): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = optedOut
    ? `${AD_OPT_OUT_COOKIE}=1; Max-Age=${2 * 365 * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`
    : `${AD_OPT_OUT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  if (optedOut) {
    window.gtag?.("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
    window.fbq?.("consent", "revoke");
    window.ttq?.revokeConsent?.();
  }
}

let booted = false;

/**
 * Installs each vendor's command queue and init call, so events sent before its script finishes
 * downloading are kept. The scripts themselves are loaded by <Analytics />.
 */
export function bootTrackers(): void {
  if (booted || typeof window === "undefined") return;
  booted = true;
  const w = window as Window & { dataLayer?: unknown[]; _fbq?: unknown };
  const { ga4, googleAds, meta, tiktok, pinterest } = TRACKING_IDS;

  if (ga4 || googleAds) {
    w.dataLayer = w.dataLayer ?? [];
    w.gtag = function gtag() {
      // gtag.js reads the Arguments object itself, not an array copy.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
    // Consent Mode v2 defaults: denied where the law expects a banner, granted elsewhere. Opted-out
    // visitors never get here (Analytics doesn't boot for them).
    const denied = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };
    w.gtag("consent", "default", { ...denied, region: CONSENT_REQUIRED_REGIONS });
    w.gtag("consent", "default", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
    });
    w.gtag("js", new Date());
    // Page views are sent by trackPageView so their URLs can be cleaned first.
    if (ga4) w.gtag("config", ga4, { send_page_view: false, allow_google_signals: false });
    // The Ads tag's conversion linker keeps the gclid/gbraid/wbraid of an ad click in a first-party cookie.
    if (googleAds) w.gtag("config", googleAds, { send_page_view: false });
  }

  if (tiktok && !w.ttq) bootTikTok(tiktok);

  if (meta && !w.fbq) {
    // Same shape as Meta's own loader stub: calls queue until fbevents.js sets callMethod.
    type FbqStub = Fbq & { queue: unknown[]; push: Fbq; loaded: boolean; version: string; disablePushState: boolean };
    const fbq = ((...args: unknown[]) => {
      if (fbq.callMethod) (fbq.callMethod as (...a: unknown[]) => void)(...args);
      else fbq.queue.push(args);
    }) as FbqStub;
    fbq.queue = [];
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    // We send page views ourselves; don't let the pixel add its own on history changes.
    fbq.disablePushState = true;
    w.fbq = fbq;
    w._fbq = fbq;
    // No automatic button and form scraping.
    fbq("set", "autoConfig", false, meta);
    fbq("init", meta);
  }

  if (pinterest && !w.pintrk) {
    type PintrkStub = Pintrk & { queue: unknown[]; version: string };
    const pintrk = ((...args: unknown[]) => {
      pintrk.queue.push(args);
    }) as PintrkStub;
    pintrk.queue = [];
    pintrk.version = "3.0";
    w.pintrk = pintrk;
    pintrk("load", pinterest);
  }
}

/** TikTok's own loader stub, unrolled: calls queue until events.js replaces the methods. */
function bootTikTok(pixelId: string): void {
  type Queue = unknown[] & Record<string, unknown>;
  const w = window as Window & { TiktokAnalyticsObject?: string };
  w.TiktokAnalyticsObject = "ttq";
  const ttq = [] as unknown as Queue & {
    methods: string[];
    _i: Record<string, Queue>;
    _t: Record<string, number>;
    _o: Record<string, unknown>;
  };
  ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
  const defer = (target: Queue, method: string) => {
    target[method] = (...args: unknown[]) => {
      target.push([method, ...args]);
    };
  };
  for (const m of ttq.methods) defer(ttq, m);
  ttq.instance = (id: string) => {
    const inst = ttq._i[id] ?? ([] as unknown as Queue);
    for (const m of ttq.methods) defer(inst, m);
    return inst;
  };
  const src = "https://analytics.tiktok.com/i18n/pixel/events.js";
  ttq._i = { [pixelId]: Object.assign([] as unknown as Queue, { _u: src }) };
  ttq._t = { [pixelId]: Date.now() };
  ttq._o = { [pixelId]: {} };
  w.ttq = ttq as unknown as Ttq;
  const script = document.createElement("script");
  script.async = true;
  script.src = `${src}?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`;
  document.head.appendChild(script);
}

/** Page address without its query string, except campaign tags. */
function cleanPageLocation(): string {
  const url = new URL(window.location.href);
  const kept = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (k.startsWith("utm_") || ["fbclid", "gclid", "gbraid", "wbraid", "ttclid", "msclkid"].includes(k)) kept.set(k, v);
  }
  const query = kept.toString();
  return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
}

function blocked(): boolean {
  return typeof window === "undefined" || hasOptedOut() || urlHasSecrets();
}

export function trackPageView(): void {
  if (blocked()) return;
  if (TRACKING_IDS.ga4) {
    window.gtag?.("event", "page_view", {
      page_location: cleanPageLocation(),
      page_path: window.location.pathname,
      page_title: document.title,
    });
  }
  if (TRACKING_IDS.meta) window.fbq?.("track", "PageView");
  if (TRACKING_IDS.tiktok) window.ttq?.page();
  if (TRACKING_IDS.pinterest) window.pintrk?.("track", "pagevisit");
}

export function track<E extends TrackEvent>(event: E, params: TrackEventParams[E]): void {
  if (blocked()) return;
  if (event !== "sign_up" && isPageViewOnlyPath(window.location.pathname)) return;
  const names = VENDOR_EVENT_NAMES[event];
  const p = params as Record<string, string | number | boolean>;
  const orderId = typeof p.order_id === "string" ? p.order_id : undefined;

  try {
    if (TRACKING_IDS.ga4 && window.gtag) {
      const ga: Record<string, unknown> = { ...p };
      if (orderId) {
        delete ga.order_id;
        ga.transaction_id = orderId;
      }
      window.gtag("event", names.ga4, ga);
    }
    if (TRACKING_IDS.meta && window.fbq) {
      // Meta deduplicates the browser and Conversions API copies of an event by eventID.
      const options = orderId ? { eventID: orderId } : undefined;
      window.fbq(names.meta.custom ? "trackCustom" : "track", names.meta.name, p, options);
    }
    if (TRACKING_IDS.googleAds && window.gtag) {
      const label = GOOGLE_ADS_LABELS[event];
      if (label) {
        const conversion: Record<string, unknown> = { send_to: `${TRACKING_IDS.googleAds}/${label}` };
        if (typeof p.value === "number") conversion.value = p.value;
        if (typeof p.currency === "string") conversion.currency = p.currency;
        if (orderId) conversion.transaction_id = orderId;
        window.gtag("event", "conversion", conversion);
      }
    }
    if (TRACKING_IDS.tiktok && window.ttq && names.tiktok) {
      const tt: Record<string, unknown> = { content_type: "product" };
      if (typeof p.value === "number") tt.value = p.value;
      if (typeof p.currency === "string") tt.currency = p.currency;
      if (typeof p.format === "string") tt.contents = [{ content_id: p.format, content_name: `${p.format} book`, quantity: 1 }];
      // TikTok deduplicates the browser and Events API copies by event_id.
      window.ttq.track(names.tiktok, tt, orderId ? { event_id: orderId } : undefined);
    }
    if (TRACKING_IDS.pinterest && window.pintrk && names.pinterest) {
      const pin: Record<string, unknown> = { ...p };
      if (names.pinterest === "custom") pin.event_name = event;
      if (orderId) pin.event_id = orderId;
      window.pintrk("track", names.pinterest, pin);
    }
  } catch {
    // Analytics must never break the app.
  }
}

const PAGES_MADE_KEY = "cm_pages_made";

/** How many coloring pages this device has made (0 when none, or when storage is blocked). */
export function readPagesMade(): number {
  try {
    return Number(localStorage.getItem(PAGES_MADE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Count a successful coloring page on this device and send `page_generated`. */
export function trackPageGenerated(signedIn: boolean): void {
  let made = 0;
  try {
    made = Number(localStorage.getItem(PAGES_MADE_KEY)) || 0;
    localStorage.setItem(PAGES_MADE_KEY, String(made + 1));
  } catch {
    /* storage blocked: count as first */
  }
  track("page_generated", { is_first: made === 0, signed_in: signedIn, intent: readTrackIntent() });
}

/** A tap on a marketing call to action. `intent` is the page or card the visitor is heading for. */
export function trackCta(location: CtaLocation, intent: TrackEventParams["cta_click"]["intent"]): void {
  track("cta_click", { location, intent });
}

/** Send `book_started` with the visit's landing intent. */
export function trackBookStarted(format: TrackEventParams["book_started"]["format"]): void {
  track("book_started", { format, intent: readTrackIntent() });
}

/** Send `purchase` from the browser once per order (the server sends its own copy). */
export function trackPurchaseOnce(input: Omit<TrackEventParams["purchase"], "intent">): void {
  // Same source as the server copy (the cm_attr landing path), so the two agree when deduplicated.
  const params: TrackEventParams["purchase"] = { ...input, intent: intentFromAttributionCookie(document.cookie) };
  const key = `cm_purchase_tracked:${params.order_id}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    /* send anyway; Meta and GA4 deduplicate by order id */
  }
  track("purchase", params);
}
