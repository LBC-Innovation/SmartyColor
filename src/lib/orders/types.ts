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

/** One page of a digital book, in order. Rotation is the final on-page rotation. */
export type DigitalBookPage =
  | { kind: "photo"; revisionId: string; rotation: 0 | 90 | 180 | 270; mirrored?: boolean }
  | { kind: "blank"; variant: "plain" | "lined" };

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

export type BookOrderSummary = {
  id: string;
  projectTitle: string | null;
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
  carrier: string | null;
  estimatedDispatchMin: string | null;
  estimatedDispatchMax: string | null;
  paidAt: string | null;
  submittedToLuluAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  luluStatusMessage: string | null;
  luluPrintJobId: number | null;
  timeline: FulfillmentStep[];
  events: BookOrderEvent[];
  deliveryExpectation: string | null;
};
