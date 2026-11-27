/** A customer's albums for the admin customer drawer, with enough detail to debug one. */

export type AdminAlbumPhoto = {
  id: string;
  position: number;
  fileName: string | null;
  orientation: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  /** Someone other than the album owner added it (a shared album). */
  uploadedByOther: boolean;
  /** Coloring page versions made from this photo. */
  sheetCount: number;
  /** Other saved versions, such as portrait crops. */
  otherVersionCount: number;
  editCount: number;
  /** The version shown in the album; null means the original photo is shown. */
  activeVersionKind: string | null;
  /** Where this page stands in the album's pre-paid book; null when the album has none. */
  bookPage: AdminBookPageStatus | null;
};

/**
 * A photo's page in a pre-paid book:
 *   included  the package pays for it (claimed when made)
 *   brought_in included; it came into the album already made
 *   granted   included because an admin chose it
 *   extra_paid outside the package, paid from the wallet
 *   extra     outside the package and not paid for (charged when the book is ordered)
 *   no_page   no coloring page yet, not in the package
 */
export type AdminBookPageStatus = "included" | "brought_in" | "granted" | "extra_paid" | "extra" | "no_page";

/** The pre-paid book (book package or gift purchase code) bound to an album. */
export type AdminAlbumPrepaid = {
  codeId: string;
  code: string;
  /** "package" = the customer bought it; "admin" = a gift purchase code. */
  source: "package" | "admin";
  status: "active" | "void";
  bindingId: string;
  bindingLabel: string;
  /** Pages the book includes, counting pages an admin granted on top. */
  includedPages: number;
  /** The package's counter of slots taken (never goes down when a photo is deleted). */
  pagesUsed: number;
  /** Photos in the album the book includes right now. */
  includedNow: number;
  /** Pages an admin added on top of the package's size. */
  grantedExtra: number;
  priceCents: number | null;
  paidWith: string | null;
  bookOrderId: string | null;
  refundedAt: string | null;
};

export type AdminAlbum = {
  id: string;
  name: string;
  /** "owner" for their own albums, "member" for one shared with them. */
  role: "owner" | "member";
  shareStatus: string | null;
  createdAt: string;
  updatedAt: string;
  designTheme: string | null;
  storyPhase: string | null;
  hasStory: boolean;
  /** People invited to this album, any status. */
  shareCount: number;
  bookOrderCount: number;
  /** The album's pre-paid book, if it has one. */
  prepaid: AdminAlbumPrepaid | null;
  photos: AdminAlbumPhoto[];
};

export type AdminUserAlbums = {
  albums: AdminAlbum[];
};
