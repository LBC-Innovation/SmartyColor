/**
 * A book the customer started in the order wizard and hasn't ordered yet.
 * The wizard owns the shape of `state`; the server only stores it.
 */

/** A page as the cart remembers it: which one, where it sits, and how it was turned. */
export type BookCartPageEntry =
  | { id: string; kind: "photo"; rotation?: 0 | 90 | 180 | 270; mirrored?: boolean }
  | { id: string; kind: "blank"; variant?: "plain" | "lined"; auto?: boolean };

export type BookCartState = {
  v: 1;
  step: string;
  /** Steps the customer has reached, so they can jump straight back to them. */
  visited: string[];
  selectedProjectIds: string[];
  bindingId: string;
  bindingTouched: boolean;
  pageFit: "framed" | "full";
  pages: BookCartPageEntry[];
  /** Coloring pages taken out of the book. */
  removedIds: string[];
  coverDesign: unknown | null;
  shipDifferent: boolean;
  /** Sent to someone else, with an optional note printed as the first page. Absent on carts saved before gifting. */
  isGift?: boolean;
  giftNote?: string;
};

export type BookCartSummary = {
  id: string;
  title: string;
  step: string;
  bindingId: string | null;
  pageCount: number;
  photoCount: number;
  /** Short-lived URL for a small picture of the first page, when there is one. */
  thumbUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookCart = BookCartSummary & { state: BookCartState };

/** What the wizard sends on every save. */
export type BookCartInput = {
  title: string;
  step: string;
  bindingId: string | null;
  pageCount: number;
  photoCount: number;
  /** Library revision of the first page, for the cart row's picture. */
  thumbRevisionId: string | null;
  state: BookCartState;
};

/** Fired on window whenever this tab saves or deletes a cart, so the header can refresh. */
export const BOOK_CARTS_CHANGED_EVENT = "cm:book-carts-changed";
