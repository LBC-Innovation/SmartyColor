import type { BookFulfillment, BookOrderStatus } from "@/lib/orders/types";

/** Statuses a customer can cancel from: paid but not yet in production at the printer. */
export const CUSTOMER_CANCELABLE_STATUSES: BookOrderStatus[] = ["paid", "failed", "submitted_to_lulu"];

/** Admins can also close out orders that were never paid. */
export const ADMIN_CANCELABLE_STATUSES: BookOrderStatus[] = [
  ...CUSTOMER_CANCELABLE_STATUSES,
  "draft",
  "quoted",
  "awaiting_payment",
];

/** Lulu statuses before production starts; a job in one of these may still be canceled. */
export const PRE_PRODUCTION_LULU_STATUSES = [
  "CREATED",
  "UNPAID",
  "PAYMENT_IN_PROGRESS",
  "PRODUCTION_DELAYED",
  "PRODUCTION_READY",
];

/** Lulu statuses for a job that is gone; nothing to cancel there. */
export const DEAD_LULU_STATUSES = ["REJECTED", "CANCELED", "ERROR"];

/**
 * Whether the customer should be offered a cancel. A hint for the UI: the server checks the live
 * Lulu job (`is_cancellable`) before canceling anything.
 */
export function customerCanCancel(order: {
  status: BookOrderStatus;
  fulfillment: BookFulfillment;
  luluStatusName: string | null;
  luluProductionDueAt: string | null;
}, now = Date.now()): boolean {
  if (order.fulfillment === "digital") return false;
  if (!CUSTOMER_CANCELABLE_STATUSES.includes(order.status)) return false;
  if (order.status !== "submitted_to_lulu") return true;
  const lulu = (order.luluStatusName ?? "").toUpperCase();
  if (lulu && !PRE_PRODUCTION_LULU_STATUSES.includes(lulu)) return false;
  if (order.luluProductionDueAt && Date.parse(order.luluProductionDueAt) <= now) return false;
  return true;
}

/** Whether an admin should be offered a cancel. The server still checks the live Lulu job. */
export function adminCanCancel(order: {
  status: BookOrderStatus;
  deletedAt?: string | null;
  luluStatusName: string | null;
  luluProductionDueAt: string | null;
}, now = Date.now()): boolean {
  if (order.deletedAt) return false;
  if (!ADMIN_CANCELABLE_STATUSES.includes(order.status)) return false;
  if (order.status !== "submitted_to_lulu") return true;
  const lulu = (order.luluStatusName ?? "").toUpperCase();
  if (lulu && !PRE_PRODUCTION_LULU_STATUSES.includes(lulu)) return false;
  if (order.luluProductionDueAt && Date.parse(order.luluProductionDueAt) <= now) return false;
  return true;
}
