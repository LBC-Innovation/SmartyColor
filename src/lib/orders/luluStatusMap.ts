import type { BookOrderStatus } from "@/lib/orders/types";

/** Map Lulu print-job status.name → internal fulfillment status. */
export function bookStatusFromLulu(luluName: string | null | undefined): BookOrderStatus | null {
  if (!luluName) return null;
  const key = luluName.toUpperCase();
  switch (key) {
    case "CREATED":
    case "UNPAID":
    case "PAYMENT_IN_PROGRESS":
      return "submitted_to_lulu";
    case "PRODUCTION_DELAYED":
    case "PRODUCTION_READY":
      return "submitted_to_lulu";
    case "IN_PRODUCTION":
      return "in_production";
    case "SHIPPED":
      return "shipped";
    case "DELIVERED":
      return "delivered";
    case "REJECTED":
    case "ERROR":
      return "failed";
    case "CANCELED":
      return "canceled";
    default:
      return null;
  }
}
