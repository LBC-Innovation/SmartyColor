/**
 * Purchase codes: a pre-paid book bundle bound to one album. The album's allowance is spent
 * before the wallet; see supabase/migrations/0037_purchase_codes.sql for the rules the database
 * enforces. Everything here is shared by the server, the studio and the admin page.
 */
import { BOOK_BINDINGS, withBlankBacks, type BookBindingId } from "@/lib/print/bookBindings";
import { shippingLevelLabel } from "@/lib/orders/shippingLevels";
import type { SheetUsageKind } from "@/lib/credits/pricing";

/** What a code includes. */
export type PurchaseCodeBundle = {
  includedPages: number;
  editsPerPage: number;
  portraitsPerPage: number;
  bindingId: BookBindingId;
  /** Each page may have a blank or lined back at no extra cost. */
  backsIncluded: boolean;
  shippingLevel: string;
  /** Most the code pays toward the book; null = the whole included book. */
  maxBookCents: number | null;
};

export type PurchaseCodeStatus = "active" | "redeemed" | "book_ordered" | "expired" | "void";

export type PurchaseCodeChannel = "email" | "sms" | "print" | "link";

export type PurchaseCodeSend = { channel: PurchaseCodeChannel; recipient: string | null; sentAt: string };

/** One code as the admin page lists it. */
export type AdminPurchaseCode = PurchaseCodeBundle & {
  id: string;
  code: string;
  campaign: string;
  campaignSlug: string;
  status: PurchaseCodeStatus;
  expiresAt: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  note: string | null;
  createdAt: string;
  redeemedAt: string | null;
  redeemedByEmail: string | null;
  projectId: string | null;
  projectName: string | null;
  pagesUsed: number;
  bookOrderId: string | null;
  bookCoveredCents: number | null;
  sends: PurchaseCodeSend[];
};

/** What the admin fills in to make codes. */
export type CreatePurchaseCodesInput = PurchaseCodeBundle & {
  campaign: string;
  /** How many codes to make with these settings (each single-use). */
  quantity: number;
  expiresAt: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  note: string | null;
};

/** The public view of a code, for the redeem page. Says nothing about who holds it. */
export type PurchaseCodePreview = {
  code: string;
  campaign: string;
  bundle: PurchaseCodeBundle;
  note: string | null;
  recipientName: string | null;
  state: "available" | "redeemed" | "expired" | "void";
  /** Set when the signed-in caller is the one who redeemed it. */
  albumId: string | null;
};

/** Uses on one photo of the album. */
export type PurchaseCodePhotoUse = { generationsUsed: number; portraitsUsed: number };

/** An album's purchase code and what is left of it, for the studio. */
export type AlbumPurchaseCode = {
  codeId: string;
  code: string;
  campaign: string;
  bundle: PurchaseCodeBundle;
  /** admin = a gift code; package = a book the customer bought for this album. */
  source: "admin" | "package";
  /** False for packages: shipping (and its tax) is paid from the wallet. */
  shippingIncluded: boolean;
  /** What the customer paid, for packages (including any shipping paid with it). */
  packagePriceCents: number | null;
  /** Packages: standard shipping and tax paid up front, applied at book checkout. */
  shippingPrepaidCents: number;
  /** The person looking is the one who redeemed or bought it (only they can cancel a package). */
  isBuyer: boolean;
  pagesUsed: number;
  /** Photos the code is paying for, by photo id. */
  photos: Record<string, PurchaseCodePhotoUse>;
  /** Photos outside the code whose page was paid for from credit in this album (extra pages). */
  extraPhotoIds?: string[];
  /** Set once the code's book has been paid for. */
  bookOrderId: string | null;
};

export const MAX_CODES_PER_BATCH = 200;

export const PURCHASE_CODE_UTM_SOURCE = "purchase_code";

/** Path of the redeem page for a code. */
export function redeemPath(code: string): string {
  return `/redeem/${encodeURIComponent(code)}`;
}

/**
 * The link a code is sent with. utm_source/medium/campaign/content say which batch, which way it
 * was sent and which code, so sign-ups and orders can be traced back to it.
 */
export function purchaseCodeLink(
  siteUrl: string,
  code: { code: string; campaignSlug: string },
  medium: PurchaseCodeChannel,
): string {
  const params = new URLSearchParams({
    utm_source: PURCHASE_CODE_UTM_SOURCE,
    utm_medium: medium === "sms" ? "sms" : medium === "print" ? "print" : medium === "email" ? "email" : "link",
    utm_campaign: code.campaignSlug,
    utm_content: code.code,
  });
  return `${siteUrl}${redeemPath(code.code)}?${params.toString()}`;
}

/** "Black Friday 2026" → "black-friday-2026". */
export function campaignSlug(campaign: string): string {
  const slug = campaign
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return slug || "purchase-code";
}

/** Codes as people type them: upper case, no spaces. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Printed pages the code pays for: the included pages (plus one for a gift note), each with a
 * back when backs are included, rounded up the way the binding needs.
 */
export function coveredPrintPages(bundle: Pick<PurchaseCodeBundle, "includedPages" | "bindingId" | "backsIncluded">): number {
  const spec = withBlankBacks(BOOK_BINDINGS[bundle.bindingId], bundle.backsIncluded);
  let count = Math.max(bundle.includedPages + 1, spec.minPages);
  if (spec.pageMultiple > 1) {
    const remainder = count % spec.pageMultiple;
    if (remainder !== 0) count += spec.pageMultiple - remainder;
  }
  count = Math.min(count, spec.maxPages);
  return bundle.backsIncluded ? count * 2 : count;
}

/** Customer-facing name of a binding ("Stapled booklet"). */
export function bindingName(bindingId: BookBindingId): string {
  return BOOK_BINDINGS[bindingId].shortLabel;
}

/** What the code includes, one line each, for the redeem page, email, card and studio. */
export function bundleLines(bundle: PurchaseCodeBundle): string[] {
  const lines = [`${bundle.includedPages} coloring ${bundle.includedPages === 1 ? "page" : "pages"} made from your photos`];
  if (bundle.editsPerPage > 0) {
    lines.push(`${bundle.editsPerPage} free ${bundle.editsPerPage === 1 ? "Creative Touch-Up" : "Creative Touch-Ups"} on each page`);
  }
  if (bundle.portraitsPerPage > 0) {
    lines.push(
      bundle.portraitsPerPage === 1
        ? "A free “convert to portrait” for each photo"
        : `${bundle.portraitsPerPage} free “convert to portrait” on each photo`,
    );
  }
  lines.push(
    `A printed ${bindingName(bundle.bindingId).toLowerCase()} with ${shippingLevelLabel(bundle.shippingLevel).toLowerCase()} shipping`,
  );
  if (bundle.backsIncluded) lines.push("Blank or lined backs behind each page, if you like");
  return lines;
}

/** Included pages not yet used. */
export function pagesLeft(album: Pick<AlbumPurchaseCode, "bundle" | "pagesUsed">): number {
  return Math.max(0, album.bundle.includedPages - album.pagesUsed);
}

/**
 * Whether the album's code pays for the next `kind` on a photo. Mirrors purchase_code_covers()
 * in the database, which has the final say; this only drives what the studio shows.
 */
export function codeCoversAction(
  album: AlbumPurchaseCode | null,
  kind: SheetUsageKind,
  photo: { id: string; editCount?: number | null },
): boolean {
  if (!album) return false;
  const use = album.photos[photo.id];
  if (kind === "edit") return Boolean(use) && (photo.editCount ?? 0) < album.bundle.editsPerPage;
  if (use) {
    if (kind === "generation") return use.generationsUsed < 1 + use.portraitsUsed;
    return use.portraitsUsed < album.bundle.portraitsPerPage;
  }
  if (kind === "portrait" && album.bundle.portraitsPerPage === 0) return false;
  return pagesLeft(album) > 0;
}

/** How many new photos the code still pays a page for. */
export function newPagesCovered(album: AlbumPurchaseCode | null): number {
  return album ? pagesLeft(album) : 0;
}
