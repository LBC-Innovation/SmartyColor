/**
 * What the book order keeps in this tab between visits (the trip to add credit, a sign-up) and
 * how a book is written to the saved cart. Shared by the studio's order panel and the old wizard.
 */
import type { BookCartPageEntry } from "@/lib/orders/cartTypes";
import { EMPTY_SHIPPING_ADDRESS } from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";
import { isPrintBindingId, type BookFormatId } from "@/lib/print/bookBindings";
import { normalizeCoverDesign, type BookCoverDesign } from "@/lib/print/bookCover";
import type { BookWizardPage } from "@/lib/print/bookWizardTypes";

/** The customer's own address: billing, and where the book ships unless they say otherwise. */
export const ADDRESS_STORAGE_KEY = "cm_shipping_address";
/** A separate delivery address, when the book ships somewhere else. */
export const SHIP_TO_STORAGE_KEY = "cm_ship_to_address";
/** The banner shown when the customer's own address is incomplete: one address, or billing when shipping elsewhere. */
export const OWN_ADDRESS_ERRORS = ["Please complete your address.", "Please complete your billing address."] as const;
export const SHIP_TO_ADDRESS_ERROR = "Please complete the shipping address.";
/** Survives the trip to add credit and back, which reloads the page. */
export const COVER_STORAGE_KEY = "cm_book_cover_design";
/** The format picked in the order panel, kept across a guest's sign-up. */
export const FORMAT_STORAGE_KEY = "cm_book_format";

/**
 * The address being typed is a draft for this tab only, so it survives the trip
 * to add credit and back; keeping it for later orders is the customer's choice,
 * saved to their account.
 */
export function readStoredAddress(key: string): ShippingAddress {
  if (typeof window === "undefined") return EMPTY_SHIPPING_ADDRESS;
  try {
    // Addresses used to be kept in this browser without asking; drop those.
    localStorage.removeItem(key);
    const raw = sessionStorage.getItem(key);
    return raw ? { ...EMPTY_SHIPPING_ADDRESS, ...(JSON.parse(raw) as Partial<ShippingAddress>) } : EMPTY_SHIPPING_ADDRESS;
  } catch {
    return EMPTY_SHIPPING_ADDRESS;
  }
}

/** Nothing typed yet: only the defaults, like the country, are set. */
export function isBlankAddress(a: ShippingAddress): boolean {
  return (Object.keys(EMPTY_SHIPPING_ADDRESS) as (keyof ShippingAddress)[]).every(
    (k) => (a[k] ?? "").trim() === (EMPTY_SHIPPING_ADDRESS[k] ?? "").trim(),
  );
}

export function storeAddress(key: string, address: ShippingAddress) {
  try {
    sessionStorage.setItem(key, JSON.stringify(address));
  } catch {
    /* ignore */
  }
}

export function readStoredCover(): BookCoverDesign | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(COVER_STORAGE_KEY);
    return raw ? normalizeCoverDesign(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function storeCover(design: BookCoverDesign | null) {
  try {
    if (design) sessionStorage.setItem(COVER_STORAGE_KEY, JSON.stringify(design));
    else sessionStorage.removeItem(COVER_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readStoredFormat(): BookFormatId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FORMAT_STORAGE_KEY);
    return isPrintBindingId(raw) || raw === "digital" ? raw : null;
  } catch {
    return null;
  }
}

export function storeFormat(id: BookFormatId | null) {
  try {
    if (id) sessionStorage.setItem(FORMAT_STORAGE_KEY, id);
    else sessionStorage.removeItem(FORMAT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** The pages as the cart remembers them: ids, order and turns, never the images. */
export function cartPages(pages: BookWizardPage[]): BookCartPageEntry[] {
  // The gift note is saved with the cart on its own, not as a page.
  return pages.flatMap((p): BookCartPageEntry[] =>
    p.kind === "photo"
      ? [{ id: p.id, kind: "photo", ...(p.rotation ? { rotation: p.rotation } : {}), ...(p.mirrored ? { mirrored: true } : {}) }]
      : p.kind === "blank"
        ? [{ id: p.id, kind: "blank", variant: p.variant === "lined" ? "lined" : "plain", ...(p.auto ? { auto: true } : {}) }]
        : [],
  );
}
