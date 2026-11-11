import { LANDING_PAGES, LANDING_ORDER, type LandingIntent } from "@/content/marketing";
import { ATTRIBUTION_COOKIE, parseAttribution, readCookieFromHeader } from "@/lib/marketing/attribution";

/** Fills {tokens} in marketing copy (src/content/marketing.ts). */

export type CopyValues = Partial<
  Record<
    | "price"
    | "pdfPrice"
    | "pagePrice"
    | "credit"
    | "date"
    | "count"
    | "min"
    | "max"
    | "more"
    | "format"
    | "size"
    | "email"
    | "refPages"
    | "refFormat",
    string | null
  >
>;

/**
 * The template with its tokens filled, or null if any token has no value (so the line is hidden).
 * A piece wrapped in [[double brackets]] is optional: it is dropped, not the whole line, when one of
 * its own tokens has no value.
 */
export function fillCopy(template: string, values: CopyValues): string | null {
  const known = (key: string) => {
    const v = values[key as keyof CopyValues];
    return v != null && v !== "";
  };
  const withOptionals = template.replace(/\[\[(.*?)\]\]/g, (_, inner: string) =>
    [...inner.matchAll(/\{(\w+)\}/g)].every((m) => known(m[1])) ? inner : "",
  );
  let missing = false;
  const out = withOptionals.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = values[key as keyof CopyValues];
    if (v == null || v === "") {
      missing = true;
      return "";
    }
    return v;
  });
  return missing ? null : out;
}

/** The marketing numbers the server reads from the real pricing code (null when unknown). */
export type NumbersInput = {
  referencePriceCents: number | null;
  welcomeCreditCents: number | null;
  digitalPriceCents: number | null;
  pagePriceCents: number | null;
  referencePages: number;
  referenceFormat: string;
};

/** Copy tokens for the numbers. The reference example (pages and format) hides with its price. */
export function numberValues(n: NumbersInput | null): CopyValues {
  if (!n) return {};
  return {
    price: n.referencePriceCents != null ? formatUsd(n.referencePriceCents) : null,
    pdfPrice: n.digitalPriceCents != null ? formatUsd(n.digitalPriceCents) : null,
    pagePrice: n.pagePriceCents != null ? formatUsd(n.pagePriceCents) : null,
    credit: n.welcomeCreditCents != null ? formatUsd(n.welcomeCreditCents) : null,
    refPages: String(n.referencePages),
    refFormat: n.referenceFormat,
  };
}

/** "$5" for whole dollars, "$14.37" otherwise. */
export function formatUsd(cents: number): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

const INTENT_KEY = "cm_intent";

/** Which landing page a visitor came from. "default" is the homepage or anywhere unknown. */
export type StoredIntent = LandingIntent;

function asIntent(value: unknown): StoredIntent | null {
  return typeof value === "string" && (LANDING_ORDER as string[]).includes(value) ? (value as StoredIntent) : null;
}

/** Remember which landing page a visitor came from, so later screens can match its promise. */
export function rememberIntent(intent: StoredIntent): void {
  try {
    sessionStorage.setItem(INTENT_KEY, intent);
  } catch {
    /* ignore */
  }
}

/**
 * The landing page this visit started from: the remembered one, else a valid `?intent=` in the
 * address (a link straight to the studio), else "default".
 */
export function readIntent(): StoredIntent {
  try {
    const saved = asIntent(sessionStorage.getItem(INTENT_KEY));
    if (saved && saved !== "default") return saved;
  } catch {
    /* ignore */
  }
  try {
    const fromUrl = asIntent(new URLSearchParams(window.location.search).get("intent"));
    if (fromUrl && fromUrl !== "default") {
      rememberIntent(fromUrl);
      return fromUrl;
    }
  } catch {
    /* ignore */
  }
  return "default";
}

/** The landing page for a site path ("/gift" is gift), or "default" for any other path. */
export function intentForPath(path: string | null | undefined): StoredIntent {
  const page = LANDING_ORDER.map((i) => LANDING_PAGES[i]).find((p) => p.path === path);
  return page && page.path !== "/" ? page.intent : "default";
}

/** The intent behind a `cm_attr` cookie value: where the ad's last tagged visit landed. */
export function intentFromAttributionCookie(cookieHeader: string | null | undefined): StoredIntent {
  const attribution = parseAttribution(readCookieFromHeader(cookieHeader, ATTRIBUTION_COOKIE));
  return intentForPath(attribution?.last.landing_path);
}

/**
 * The intent to send with analytics events: this visit's, or, in a later visit, where the visitor's
 * last ad click landed. Never contains anything personal.
 */
export function readTrackIntent(): StoredIntent {
  const now = readIntent();
  if (now !== "default") return now;
  try {
    return intentFromAttributionCookie(document.cookie);
  } catch {
    return "default";
  }
}
