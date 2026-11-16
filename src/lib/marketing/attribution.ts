import { classifyChannel, type Channel } from "@/lib/marketing/channel";

/**
 * Where a visitor came from. Stored in a first-party cookie for 30 days and copied onto the user
 * (at sign-up), the order (when it is created) and guests' AI cost rows, so a sign-up, an order or
 * a free page can be traced to the campaign, friend or site that produced it.
 *
 * first: the visitor's first recorded visit (kept for 30 days).
 * last:  the latest visit that came from somewhere (a tagged link, an ad click or another site).
 *        A direct visit never replaces it, the same "last non-direct" rule GA4 and ad platforms use.
 */
export const ATTRIBUTION_COOKIE = "cm_attr";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Query params kept from the landing URL. */
export const ATTRIBUTION_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  // Ad click ids: Google (web, iOS app-to-web, iOS web-to-app), Microsoft, Meta, TikTok,
  // LinkedIn, Pinterest, X, Snapchat.
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "fbclid",
  "ttclid",
  "li_fat_id",
  "epik",
  "twclid",
  "sccid",
  // Our own referral code.
  "ref",
] as const;

type AttributionParam = (typeof ATTRIBUTION_PARAMS)[number];

export type AttributionTouch = Partial<Record<AttributionParam, string>> & {
  /** Path the visitor landed on, without its query string. */
  landing_path: string;
  /** ISO time of the touch. */
  at: string;
  /** Hostname of the site that sent the visitor, when it wasn't us. */
  referrer?: string;
  /** Channel as classified when the visit was recorded. Reports re-classify from the fields above. */
  channel?: Channel;
};

export type Attribution = { first: AttributionTouch; last: AttributionTouch };

const MAX_VALUE_LENGTH = 200;
/** Cookies are capped near 4KB; click ids can be long, so trim them harder. */
const CLICK_ID_LENGTH = 120;
const CLICK_IDS = new Set<string>(["gclid", "gbraid", "wbraid", "msclkid", "fbclid", "ttclid", "li_fat_id", "epik", "twclid", "sccid"]);

function cap(key: string, v: string): string {
  return v.slice(0, CLICK_IDS.has(key) ? CLICK_ID_LENGTH : MAX_VALUE_LENGTH);
}

function cleanTouch(value: unknown): AttributionTouch | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const touch: AttributionTouch = {
    landing_path: typeof raw.landing_path === "string" ? raw.landing_path.slice(0, MAX_VALUE_LENGTH) : "/",
    at: typeof raw.at === "string" ? raw.at.slice(0, 40) : new Date(0).toISOString(),
  };
  for (const key of ATTRIBUTION_PARAMS) {
    const v = raw[key];
    if (typeof v === "string" && v) touch[key] = cap(key, v);
  }
  if (typeof raw.referrer === "string" && raw.referrer) touch.referrer = raw.referrer.slice(0, 120).toLowerCase();
  touch.channel = classifyChannel(touch);
  return touch;
}

/** Reads the cookie's value (already URI-decoded or not). Returns null for anything malformed. */
export function parseAttribution(cookieValue: string | null | undefined): Attribution | null {
  if (!cookieValue) return null;
  try {
    let text = cookieValue;
    if (text.startsWith("%7B")) text = decodeURIComponent(text);
    const parsed = JSON.parse(text) as { first?: unknown; last?: unknown };
    const first = cleanTouch(parsed.first);
    const last = cleanTouch(parsed.last) ?? first;
    return first && last ? { first, last } : null;
  } catch {
    return null;
  }
}

/** Stored attribution (profiles/book_orders jsonb) in the same clean shape, or null. */
export function attributionFromJson(value: unknown): Attribution | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { first?: unknown; last?: unknown };
  const first = cleanTouch(v.first);
  const last = cleanTouch(v.last) ?? first;
  return first && last ? { first, last } : null;
}

/** One cookie's value from a raw `Cookie` header. */
export function readCookieFromHeader(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

export function attributionFromRequest(request: Request): Attribution | null {
  return parseAttribution(readCookieFromHeader(request.headers.get("cookie"), ATTRIBUTION_COOKIE));
}

let referrerConsumed = false;

/** Hostname of document.referrer when it's another site; null for our own pages or none. */
function externalReferrer(): string | null {
  try {
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname.toLowerCase();
    if (!host || host === window.location.hostname.toLowerCase()) return null;
    // Our own domains (www vs apex, preview deployments) are not a source.
    const ours = window.location.hostname.replace(/^www\./, "");
    if (host.replace(/^www\./, "") === ours) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/**
 * Browser only: record where this visit came from. A tagged link, an ad click id or another site
 * replaces the last touch; a direct visit only fills the cookie when it is empty, so the first
 * visit is always known. The first touch is kept for 30 days.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const touch: AttributionTouch = { landing_path: window.location.pathname, at: new Date().toISOString() };
  let fromSomewhere = false;
  for (const key of ATTRIBUTION_PARAMS) {
    const v = params.get(key);
    if (v) {
      touch[key] = cap(key, v);
      fromSomewhere = true;
    }
  }
  // document.referrer stays the same across in-app navigation: only the page load's first call uses it.
  const referrer = referrerConsumed ? null : externalReferrer();
  referrerConsumed = true;
  if (referrer) {
    touch.referrer = referrer;
    fromSomewhere = true;
  }
  touch.channel = classifyChannel(touch);

  const current = parseAttribution(readCookieFromHeader(document.cookie, ATTRIBUTION_COOKIE));
  if (current && !fromSomewhere) return;
  // A first touch older than 30 days no longer counts; this visit starts a new window.
  const firstAt = current ? Date.parse(current.first.at) : NaN;
  const firstStale = Number.isFinite(firstAt) && Date.now() - firstAt > MAX_AGE_SECONDS * 1000;
  const next: Attribution = { first: current && !firstStale ? current.first : touch, last: touch };
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}
