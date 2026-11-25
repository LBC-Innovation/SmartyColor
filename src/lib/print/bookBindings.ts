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
  /**
   * Every page is printed on its own sheet with the back left blank. The limits above
   * are then counted in pages the customer arranges, each one two printed sides.
   */
  blankBacks?: boolean;
};

export const BOOK_BINDINGS: Record<BookBindingId, BookBindingSpec> = {
  perfect_bound: {
    id: "perfect_bound",
    productId: "coloring-book-pb-bw-85x11",
    label: "Perfect bound",
    description: "Paperback book — great for larger albums.",
    shortLabel: "Paperback",
    blurb: "Glued spine like a bookstore paperback. Best for bigger books.",
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
    description: "Stapled booklet — the printed page count is a multiple of 4, so blank pages may be added at the end.",
    shortLabel: "Stapled booklet",
    blurb: "Folded and stapled, lies flat. Best for smaller books.",
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
    description: "Spiral bound book — lies flat and folds back on itself.",
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

/**
 * Leave the back of every page blank, so markers can't bleed through onto the next
 * picture. On unless the customer turns it off to save money.
 */
export const BLANK_BACKS_DEFAULT = true;

/**
 * A format's limits in pages the customer arranges. With blank backs each page takes a
 * whole sheet (two printed sides), so a binding holds half as many and its minimum and
 * multiple halve too. The PDF prints at home and never has blank backs.
 */
export function withBlankBacks(spec: BookBindingSpec, blankBacks: boolean): BookBindingSpec {
  if (!blankBacks || spec.id === "digital") return spec;
  return {
    ...spec,
    minPages: Math.ceil(spec.minPages / 2),
    maxPages: Math.floor(spec.maxPages / 2),
    pageMultiple: Math.max(1, Math.ceil(spec.pageMultiple / 2)),
    blankBacks: true,
  };
}

/** Best default for a given number of coloring pages. */
export function recommendBinding(photoCount: number, blankBacks = BLANK_BACKS_DEFAULT): BookBindingId {
  const booklet = withBlankBacks(BOOK_BINDINGS.saddle_stitch, blankBacks);
  return photoCount <= booklet.maxPages ? "saddle_stitch" : "perfect_bound";
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
  blurb: "A PDF of your whole book to print on your own printer. Download it again anytime from My orders.",
  podPackageId: "digital",
  minPages: 1,
  maxPages: 800,
  pageMultiple: 1,
  requiredOrientation: "portrait",
};

export function isDigitalFormat(id: BookFormatId): id is "digital" {
  return id === "digital";
}

/** A format's spec; pass `blankBacks` for its limits as the customer counts pages. */
export function getBookFormat(id: BookFormatId, blankBacks = false): BookBindingSpec {
  return withBlankBacks(id === "digital" ? DIGITAL_FORMAT : BOOK_BINDINGS[id], blankBacks);
}

/**
 * The "Print as you go" card's picture, in the same style as the binding photos.
 */
export const PRINT_AS_YOU_GO_PHOTO = {
  src: "/marketing/print-as-you-go.webp",
  alt: "A purple home printer with a fresh coloring page coming out",
  width: 960,
  height: 540,
};

/** A close-up photo of each printed binding, for the format pickers and the landing page. */
export const BINDING_PHOTOS: Record<BookBindingId, { src: string; alt: string; width: number; height: number }> = {
  perfect_bound: {
    src: "/marketing/binding-paperback.webp",
    alt: "Corner of a paperback book with a square glued spine",
    width: 960,
    height: 540,
  },
  saddle_stitch: {
    src: "/marketing/binding-saddle-stitch.webp",
    alt: "Corner of a thin stapled booklet with a folded spine",
    width: 960,
    height: 540,
  },
  coil_bound: {
    src: "/marketing/binding-coil.webp",
    alt: "Corner of a spiral bound book with a black plastic coil",
    width: 960,
    height: 540,
  },
};
