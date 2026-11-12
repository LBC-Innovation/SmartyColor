export const BOOK_ORDER_STATUSES = [
  "draft",
  "quoted",
  "awaiting_payment",
  "paid",
  "submitting_to_lulu",
  "submitted_to_lulu",
  "in_production",
  "shipped",
  "delivered",
  "failed",
  "canceled",
  "refunded",
] as const;

export type BookOrderStatus = (typeof BOOK_ORDER_STATUSES)[number];

/** print = shipped by the printer; digital = print-at-home PDF. */
export type BookFulfillment = "print" | "digital";

/** One page of a book (print-at-home or printed), in order. Rotation is the final on-page rotation. */
export type DigitalBookPage =
  | {
      kind: "photo";
      revisionId: string;
      rotation: 0 | 90 | 180 | 270;
      mirrored?: boolean;
      /** "full" fills the page edge to edge; otherwise the sheet is framed inside the margin. */
      fit?: "framed" | "full";
    }
  | { kind: "blank"; variant: "plain" | "lined" }
  /** A gift note, printed as plain text on its own page (always the first page). */
  | { kind: "note"; text: string };

export type BookPaymentMethod = "stripe" | "credits" | "mixed";

export type ShippingAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state_code?: string;
  postcode: string;
  country_code: string;
  phone_number: string;
  email?: string;
};

/** Lulu's "did you mean" for an entered address; it only warns and never blocks an order. */
export type AddressSuggestion = {
  warnings: { code: string; message: string }[];
  suggested: Partial<ShippingAddress>;
};

export type BookOrderSummary = {
  id: string;
  projectTitle: string | null;
  productId: string;
  productName: string;
  pageCount: number;
  status: BookOrderStatus;
  fulfillment: BookFulfillment;
  luluStatusName: string | null;
  shippingLevel: string;
  totalCents: number | null;
  paymentMethod: BookPaymentMethod | null;
  estimatedDeliveryMin: string | null;
  estimatedDeliveryMax: string | null;
  trackingNumber: string | null;
  trackingUrls: string[];
  createdAt: string;
  updatedAt: string;
  /** Lulu's production delay ends here; after that the book can't be canceled. */
  luluProductionDueAt: string | null;
  /** The customer may cancel (a hint; the server re-checks with Lulu). */
  canCancel: boolean;
  /** Credits returned to the wallet when the order was canceled. */
  refundedCents: number | null;
};

export type BookOrderEvent = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  occurredAt: string;
};

export type FulfillmentStep = {
  id: string;
  label: string;
  description: string;
  state: "complete" | "current" | "upcoming";
  occurredAt: string | null;
};

export type BookOrderDetail = BookOrderSummary & {
  contactEmail: string;
  shippingAddress: ShippingAddress;
  /** Null when the customer bills and ships to the same address. */
  billingAddress: ShippingAddress | null;
  /** Sent to someone else; the note, if any, prints as the first page. */
  isGift: boolean;
  giftNote: string | null;
  /** Print orders: the interior and cover PDFs have been built. */
  hasPrintFiles: boolean;
  carrier: string | null;
  estimatedDispatchMin: string | null;
  estimatedDispatchMax: string | null;
  paidAt: string | null;
  submittedToLuluAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  luluStatusMessage: string | null;
  luluPrintJobId: number | null;
  canceledAt: string | null;
  cancelReason: string | null;
  timeline: FulfillmentStep[];
  events: BookOrderEvent[];
  deliveryExpectation: string | null;
};
