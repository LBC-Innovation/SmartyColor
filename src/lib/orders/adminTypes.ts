import type { BookFulfillment, BookOrderStatus, BookPaymentMethod } from "@/lib/orders/types";

export type AdminUserOrderSummary = {
  id: string;
  projectTitle: string | null;
  productName: string;
  /** Printed sides (blank backs included). */
  pageCount: number;
  blankBacks: boolean;
  /** With `blankBacks`, the backs are ruled for writing. */
  linedBacks: boolean;
  status: BookOrderStatus;
  totalCents: number | null;
  createdAt: string;
  canceledAt: string | null;
  deletedAt: string | null;
  luluPrintJobId: number | null;
  luluStatusName: string | null;
  fulfillment: BookFulfillment;
  /** Null once the account that placed it is deleted. */
  userId: string | null;
  /** Present on the all-orders admin list. */
  userEmail?: string | null;
  contactEmail: string | null;
  cancelReason: string | null;
  refundedCents: number | null;
  luluProductionDueAt: string | null;
  /** The book before shipping and tax, as charged. */
  subtotalCents: number | null;
  shippingCents: number | null;
  taxCents: number | null;
  /** What Lulu charges us (printing, shipping and tax); null for print-at-home. */
  luluCostCents: number | null;
  /** Paid by the album's book package or purchase code (bought earlier, by card or wallet). */
  coveredCents?: number;
  /** Paid from the wallet when the order was placed. */
  creditsAppliedCents?: number | null;
};
