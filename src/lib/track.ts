import { readCookieFromHeader } from "@/lib/marketing/attribution";
import {
  AD_OPT_OUT_COOKIE,
  VENDOR_EVENT_NAMES,
  type TrackEvent,
  type TrackEventParams,
} from "@/lib/marketing/events";

/**
 * The one place the app talks to GA4, Meta Pixel and the Pinterest tag. Components call
 * `track()`; nothing else calls gtag, fbq or pintrk. Every call is a no-op when the visitor has
 * opted out, sends Global Privacy Control, or the vendor's id isn't configured.
 */

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown };
type Pintrk = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    fbq?: Fbq;
    pintrk?: Pintrk;
  }
}

const ID_PATTERN = /^[A-Za-z0-9-]{3,40}$/;

function cleanId(value: string | undefined): string | null {
  const v = value?.trim();
  return v && ID_PATTERN.test(v) ? v : null;
}

export const TRACKING_IDS = {
  ga4: cleanId(process.env.NEXT_PUBLIC_GA4_ID),
  meta: cleanId(process.env.NEXT_PUBLIC_META_PIXEL_ID),
  pinterest: cleanId(process.env.NEXT_PUBLIC_PINTEREST_TAG_ID),
};

export function anyTrackerConfigured(): boolean {
  return Boolean(TRACKING_IDS.ga4 || TRACKING_IDS.meta || TRACKING_IDS.pinterest);
}

/** Pages where only a page view is sent: sign-in, sign-up, password reset and account settings. */
const PAGE_VIEW_ONLY_PREFIXES = ["/sign-in", "/sign-up", "/reset-password", "/account", "/auth"];

export function isPageViewOnlyPath(pathname: string): boolean {
  return PAGE_VIEW_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** URL bits that may hold a sign-in secret (email confirmation, password reset, OAuth code). */
const SECRET_URL_KEYS = ["access_token", "refresh_token", "token", "token_hash", "code", "type"];

export function urlHasSecrets(): boolean {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
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
  const { ga4, meta, pinterest } = TRACKING_IDS;

  if (ga4) {
    w.dataLayer = w.dataLayer ?? [];
    w.gtag = function gtag() {
      // gtag.js reads the Arguments object itself, not an array copy.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
    w.gtag("js", new Date());
    // Page views are sent by trackPageView so their URLs can be cleaned first.
    w.gtag("config", ga4, { send_page_view: false, allow_google_signals: false });
  }

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

/** Page address without its query string, except campaign tags. */
function cleanPageLocation(): string {
  const url = new URL(window.location.href);
  const kept = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (k.startsWith("utm_") || k === "fbclid" || k === "gclid") kept.set(k, v);
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

/** Count a successful coloring page on this device and send `page_generated`. */
export function trackPageGenerated(signedIn: boolean): void {
  let made = 0;
  try {
    made = Number(localStorage.getItem(PAGES_MADE_KEY)) || 0;
    localStorage.setItem(PAGES_MADE_KEY, String(made + 1));
  } catch {
    /* storage blocked: count as first */
  }
  track("page_generated", { is_first: made === 0, signed_in: signedIn });
}

/** Send `purchase` from the browser once per order (the server sends its own copy). */
export function trackPurchaseOnce(params: TrackEventParams["purchase"]): void {
  const key = `cm_purchase_tracked:${params.order_id}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    /* send anyway; Meta and GA4 deduplicate by order id */
  }
  track("purchase", params);
}
