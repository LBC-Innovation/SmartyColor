import { LANDING_PAGES, LANDING_ORDER, type LandingIntent } from "@/content/marketing";
import { ATTRIBUTION_COOKIE, parseAttribution, readCookieFromHeader } from "@/lib/marketing/attribution";
import { formatCredits } from "@/lib/credits/money";
import type { BookPackage } from "@/lib/bookPackages/types";

/** Fills {tokens} in marketing copy (src/content/marketing.ts). */

export type CopyValues = Partial<
  Record<
    | "price"
    | "pdfPrice"
    | "pagePrice"
    | "freeSheets"
    | "freePages"
    | "date"
    | "count"
    | "min"
    | "max"
    | "more"
    | "format"
    | "size"
    | "email"
    | "refPages"
    | "refFormat"
    | "packageFrom"
    | "photosRange"
    | "editsEach"
    | "touchUps",
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

/** A package as the landing shows it: the same fields as the wizard's `BookPackage`. */
export type MarketingPackage = BookPackage;

/** The marketing numbers the server reads from the real pricing code (null when unknown). */
export type NumbersInput = {
  referencePriceCents: number | null;
  /** How many free sheets the sign-up gift covers; null when it's off or unknown. */
  welcomeFreeSheets: number | null;
  digitalPriceCents: number | null;
  pagePriceCents: number | null;
  referencePages: number;
  referenceFormat: string;
  /**
   * Buyable book packages, in sort order. null when the feature is off or the catalog can't be
   * read; an empty list when none is priced. Both mean "no packages": the landing falls back.
   */
  packages: MarketingPackage[] | null;
};

/** True when there is at least one package to sell, so a landing page can lead with the book. */
export function hasPackages(n: NumbersInput | null): boolean {
  return (n?.packages?.length ?? 0) > 0;
}

/** Page-level tokens from the package catalog. Each hides itself when it can't be said truthfully. */
function packageValues(packages: MarketingPackage[] | null): CopyValues {
  if (!packages || packages.length === 0) {
    return { packageFrom: null, photosRange: null, editsEach: null, touchUps: null };
  }
  const prices = packages.map((p) => p.priceCents);
  const photos = packages.map((p) => p.includedPhotos);
  const lo = Math.min(...photos);
  const hi = Math.max(...photos);
  const edits = new Set(packages.map((p) => p.editsPerPhoto));
  const shared = edits.size === 1 ? [...edits][0] : 0;
  return {
    packageFrom: formatCredits(Math.min(...prices)),
    photosRange: lo === hi ? String(lo) : `${lo} to ${hi}`,
    // Only when every package gives the same number, and it is above 0.
    editsEach: shared > 0 ? String(shared) : null,
    touchUps: shared > 0 ? `${shared} free touch-up${shared === 1 ? "" : "s"}` : null,
  };
}

/** Copy tokens for the numbers. The reference example (pages and format) hides with its price. */
export function numberValues(n: NumbersInput | null): CopyValues {
  if (!n) return {};
  return {
    price: n.referencePriceCents != null ? formatUsd(n.referencePriceCents) : null,
    pdfPrice: n.digitalPriceCents != null ? formatUsd(n.digitalPriceCents) : null,
    pagePrice: n.pagePriceCents != null ? formatUsd(n.pagePriceCents) : null,
    freeSheets: n.welcomeFreeSheets != null ? formatFreeSheets(n.welcomeFreeSheets) : null,
    freePages: n.welcomeFreeSheets != null ? `${n.welcomeFreeSheets} free ${n.welcomeFreeSheets === 1 ? "page" : "pages"}` : null,
    refPages: String(n.referencePages),
    refFormat: n.referenceFormat,
    ...packageValues(n.packages),
  };
}

/** "35 free coloring pages" (or "1 free coloring page"): the sign-up gift as copy says it. */
export function formatFreeSheets(count: number): string {
  return `${count} free coloring ${count === 1 ? "page" : "pages"}`;
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
