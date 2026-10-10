export type BookBindingId = "perfect_bound" | "saddle_stitch";

export type BookBindingSpec = {
  id: BookBindingId;
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
  /** Pad total page count to this multiple (saddle stitch). */
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
};

export function getBookBinding(id: BookBindingId): BookBindingSpec {
  return BOOK_BINDINGS[id];
}

/** Best default for a given number of coloring pages. */
export function recommendBinding(photoCount: number): BookBindingId {
  return photoCount <= BOOK_BINDINGS.saddle_stitch.maxPages ? "saddle_stitch" : "perfect_bound";
}
