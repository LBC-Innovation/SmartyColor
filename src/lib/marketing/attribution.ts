/**
 * Which ad or link brought a visitor here. Stored in a first-party cookie for 30 days and copied
 * onto the user (at sign-up) and the order (when it is created), so an order can be traced to the
 * campaign that produced it.
 */
export const ATTRIBUTION_COOKIE = "cm_attr";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const ATTRIBUTION_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "ref",
] as const;

type AttributionParam = (typeof ATTRIBUTION_PARAMS)[number];

export type AttributionTouch = Partial<Record<AttributionParam, string>> & {
  /** Path the visitor landed on, without its query string. */
  landing_path: string;
  /** ISO time of the touch. */
  at: string;
};

export type Attribution = { first: AttributionTouch; last: AttributionTouch };

const MAX_VALUE_LENGTH = 200;

function cleanTouch(value: unknown): AttributionTouch | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const touch: AttributionTouch = {
    landing_path: typeof raw.landing_path === "string" ? raw.landing_path.slice(0, MAX_VALUE_LENGTH) : "/",
    at: typeof raw.at === "string" ? raw.at.slice(0, 40) : new Date(0).toISOString(),
  };
  for (const key of ATTRIBUTION_PARAMS) {
    const v = raw[key];
    if (typeof v === "string" && v) touch[key] = v.slice(0, MAX_VALUE_LENGTH);
  }
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

/**
 * Browser only: if this URL carries a campaign or click id, record it. The first touch is kept
 * for 30 days; the last touch is replaced by each new tagged visit.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const touch: AttributionTouch = { landing_path: window.location.pathname, at: new Date().toISOString() };
  let tagged = false;
  for (const key of ATTRIBUTION_PARAMS) {
    const v = params.get(key);
    if (v) {
      touch[key] = v.slice(0, MAX_VALUE_LENGTH);
      tagged = true;
    }
  }
  if (!tagged) return;

  const current = parseAttribution(readCookieFromHeader(document.cookie, ATTRIBUTION_COOKIE));
  const next: Attribution = { first: current?.first ?? touch, last: touch };
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}
