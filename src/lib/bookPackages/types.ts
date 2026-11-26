/**
 * Book packages: a book the customer buys up front (printing and N photo pages with E touch-ups
 * each, bound to one album). Server-owned prices; the browser only ever shows what the API sent.
 * See supabase/migrations/0043_book_packages.sql for the rules the database enforces.
 */
import type { AddressSuggestion, ShippingAddress } from "@/lib/orders/types";
import { BOOK_BINDINGS, withBlankBacks, type BookBindingId } from "@/lib/print/bookBindings";

/** A package a customer can buy right now (active and priced). */
export type BookPackage = {
  bindingId: BookBindingId;
  includedPhotos: number;
  editsPerPhoto: number;
  priceCents: number;
  sortOrder: number;
};

/** What the new-album screen needs. */
export type BookPackageList = {
  packages: BookPackage[];
  /** Wallet balance in cents when signed in. */
  creditsBalanceCents: number | null;
};

/** A catalog row as the admin editor sees it. */
export type AdminBookPackage = {
  bindingId: BookBindingId;
  includedPhotos: number;
  editsPerPhoto: number;
  /** Null hides the package. */
  priceCents: number | null;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
  /** Printed sides with a blank back behind each photo. */
  printedPages: number;
  fits: boolean;
  minPages: number;
  maxPages: number;
};

export type AdminBookPackageUpdate = Partial<{
  includedPhotos: number;
  editsPerPhoto: number;
  priceCents: number | null;
  active: boolean;
  sortOrder: number;
}>;

/** The result of buying (or confirming) a package: the album that now holds it. */
export type BookPackagePurchase = {
  codeId: string;
  projectId: string;
  bindingId: BookBindingId;
  includedPhotos: number;
  editsPerPhoto: number;
  /** Everything paid: the package plus any shipping paid with it. */
  priceCents: number;
  /** Standard shipping and tax paid with the package (0 when the customer left it for later). */
  shippingPrepaidCents: number;
  /** False when this checkout had already been turned into a package (a repeat confirm). */
  created: boolean;
  creditsBalanceCents?: number;
};

/** Answer of the confirm-on-return call. */
export type BookPackageConfirmation =
  | { status: "ready"; purchase: BookPackagePurchase }
  | { status: "pending" };

export const PACKAGE_CHECKOUT_SESSION_PARAM = "session_id";
/** sessionStorage key that keeps the chosen book across sign-up and a closed tab. */
export const PACKAGE_CHOICE_KEY = "cm_package_choice";
export const PACKAGE_ALBUM_NAME_MAX = 80;

export const PACKAGE_PRICE_CHANGED_CODE = "PRICE_CHANGED";
/** The shipping quoted on screen no longer matches a fresh quote; quote again before paying. */
export const PACKAGE_SHIPPING_CHANGED_CODE = "SHIPPING_CHANGED";
/** The printer could not price shipping to this address. */
export const PACKAGE_SHIPPING_UNAVAILABLE_CODE = "SHIPPING_UNAVAILABLE";

/**
 * Standard shipping for the package's book to one address, paid with the package so the book
 * costs nothing more at checkout. `shippingCents` is shipping plus the tax the printer adds,
 * which is what the wallet would otherwise pay when the book is ordered.
 */
export type BookPackageShippingQuote = {
  bindingId: BookBindingId;
  shippingCents: number;
  /** The address as the server will save and quote it. */
  address: ShippingAddress;
  /** The printer's cleaned-up version of the address, when it has one. */
  addressSuggestion: AddressSuggestion | null;
};

/** Sent with a purchase to pay the shipping too. */
export type BookPackageShippingInput = {
  address: ShippingAddress;
  /** What the screen showed. A different fresh quote refuses the purchase (SHIPPING_CHANGED). */
  expectedShippingCents: number;
};
export const PACKAGE_UNAVAILABLE_CODE = "PACKAGE_UNAVAILABLE";

/** Printed sides for N photos with a blank back behind each, and whether the binding can print them. */
export function packagePrintFit(bindingId: BookBindingId, includedPhotos: number) {
  const spec = withBlankBacks(BOOK_BINDINGS[bindingId], true);
  const printedPages = includedPhotos * 2;
  // The binding's limits count pages the customer arranges once blank backs are on; the raw
  // limits count printed sides.
  const raw = BOOK_BINDINGS[bindingId];
  return {
    printedPages,
    minPages: raw.minPages,
    maxPages: raw.maxPages,
    fits: includedPhotos >= spec.minPages && includedPhotos <= spec.maxPages,
  };
}

export function isBookBindingId(value: unknown): value is BookBindingId {
  return value === "saddle_stitch" || value === "coil_bound" || value === "perfect_bound";
}

/** "1 photo", "2 photos". */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}

/**
 * What canceling an album's book package would return right now. Refund = price paid − pages made
 * × the page price, never below 0, paid to the wallet. The database computes it (0044).
 */
export type BookPackageRefundQuote = {
  codeId: string;
  bindingId: BookBindingId;
  pricePaidCents: number;
  /** Shipping paid with the package (part of pricePaidCents, always refunded). */
  shippingPrepaidCents: number;
  pagesUsed: number;
  pagePriceCents: number;
  pagesChargedCents: number;
  refundCents: number;
  /** Active, not yet used for a book, and this person bought it. */
  cancelable: boolean;
  bookOrdered: boolean;
  refunded: boolean;
  isBuyer: boolean;
};

/** After a cancel: what went back to the wallet, and whether the album was deleted too. */
export type BookPackageRefund = {
  refundCents: number;
  pagesUsed: number;
  pagesChargedCents: number;
  creditsBalanceCents: number;
  albumDeleted: boolean;
};

export const PACKAGE_NOT_CANCELABLE_CODE = "PACKAGE_NOT_CANCELABLE";
