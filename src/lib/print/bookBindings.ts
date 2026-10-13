export type BookBindingId = "perfect_bound" | "saddle_stitch" | "coil_bound";
/** A way to get the book: a print binding, or the print-at-home PDF. */
export type BookFormatId = BookBindingId | "digital";

export type BookBindingSpec = {
  id: BookFormatId;
  productId: string;
  label: string;
  description: string;
  /** Plain-English name shown to customers. */
  shortLabel: string;
  /** One-line pitch shown on the binding card. */
  blurb: string;
  podPackageId: string;
  minPages: number;
  maxPages: number;
  /** Pad total page count to this multiple (saddle stitch folds in fours, coil sheets have two sides). */
  pageMultiple: number;
  requiredOrientation: "portrait";
};

export const BOOK_BINDINGS: Record<BookBindingId, BookBindingSpec> = {
  perfect_bound: {
    id: "perfect_bound",
    productId: "coloring-book-pb-bw-85x11",
    label: "Perfect bound",
    description: "Paperback book — great for larger albums (32+ pages).",
    shortLabel: "Paperback",
    blurb: "Glued spine like a bookstore paperback. Best for 32 pages or more.",
    podPackageId: "0850X1100.BW.STD.PB.060UW444.MXX",
    minPages: 32,
    maxPages: 800,
    pageMultiple: 1,
    requiredOrientation: "portrait",
  },
  saddle_stitch: {
    id: "saddle_stitch",
    productId: "coloring-book-saddle-bw-85x11",
    label: "Saddle stitch",
    description:
      "Stapled booklet — 4–48 pages. Total must be a multiple of 4 (e.g. 4, 8, 12…), so 5–7 coloring pages become an 8-page book.",
    shortLabel: "Stapled booklet",
    blurb: "Folded and stapled, lies flat. Up to 48 pages, in sets of 4.",
    podPackageId: "0850X1100.BW.STD.SS.060UW444.MXX",
    minPages: 4,
    maxPages: 48,
    pageMultiple: 4,
    requiredOrientation: "portrait",
  },
  coil_bound: {
    id: "coil_bound",
    productId: "coloring-book-coil-bw-85x11",
    label: "Coil bound",
    description: "Spiral bound book — lies flat and folds back on itself, 2–470 pages.",
    shortLabel: "Spiral bound",
    blurb: "Plastic coil spine. Lies flat and folds all the way back, great for coloring.",
    podPackageId: "0850X1100.BW.STD.CO.060UW444.MXX",
    minPages: 2,
    maxPages: 470,
    pageMultiple: 2,
    requiredOrientation: "portrait",
  },
};

export const PRINT_BINDING_IDS = Object.keys(BOOK_BINDINGS) as BookBindingId[];

export function isPrintBindingId(value: unknown): value is BookBindingId {
  return typeof value === "string" && (PRINT_BINDING_IDS as string[]).includes(value);
}

export function bindingIdForProduct(productId: string): BookBindingId | null {
  return PRINT_BINDING_IDS.find((id) => BOOK_BINDINGS[id].productId === productId) ?? null;
}

export function getBookBinding(id: BookBindingId): BookBindingSpec {
  return BOOK_BINDINGS[id];
}

/** Best default for a given number of coloring pages. */
export function recommendBinding(photoCount: number): BookBindingId {
  return photoCount <= BOOK_BINDINGS.saddle_stitch.maxPages ? "saddle_stitch" : "perfect_bound";
}

/**
 * Print-at-home PDF. Not a printer binding: no minimum, no multiple, so a book
 * is exactly the pages the user arranges. Priced flat from the wallet.
 */
export const DIGITAL_FORMAT: BookBindingSpec = {
  id: "digital",
  productId: "coloring-book-digital-pdf",
  label: "Digital download",
  description: "A PDF of your arranged pages to print at home.",
  shortLabel: "Print at home",
  blurb: "Instant PDF to print on your own printer. Download it again anytime from My Orders.",
  podPackageId: "digital",
  minPages: 1,
  maxPages: 800,
  pageMultiple: 1,
  requiredOrientation: "portrait",
};

export function isDigitalFormat(id: BookFormatId): id is "digital" {
  return id === "digital";
}

export function getBookFormat(id: BookFormatId): BookBindingSpec {
  return id === "digital" ? DIGITAL_FORMAT : BOOK_BINDINGS[id];
}
