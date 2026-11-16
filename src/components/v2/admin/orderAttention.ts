import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Why an order needs the owner, or null when it doesn't. Shared by the sidebar badge, Overview and
 * the Orders "Needs attention" tab so the three always agree.
 */
export function orderAttention(order: AdminUserOrderSummary, now = Date.now()): { tone: "critical" | "warning"; reason: string } | null {
  const age = now - new Date(order.createdAt).getTime();
  switch (order.status) {
    case "failed":
      return { tone: "critical", reason: "The printer rejected it. Resubmit it, or cancel and refund the customer." };
    case "paid":
    case "submitting_to_lulu":
      // Paid print orders go to the printer within minutes; a day means the hand-off stalled.
      if (order.fulfillment === "print" && age > DAY) {
        return { tone: "warning", reason: "Paid over a day ago but not at the printer yet." };
      }
      return null;
    case "submitted_to_lulu":
    case "in_production":
      if (age > 10 * DAY) return { tone: "warning", reason: "With the printer for over 10 days and not shipped." };
      return null;
    case "awaiting_payment":
      if (age > 2 * DAY) return { tone: "warning", reason: "Waiting for payment for over 2 days." };
      return null;
    default:
      return null;
  }
}

export function ordersNeedingAttention(orders: AdminUserOrderSummary[]): AdminUserOrderSummary[] {
  const now = Date.now();
  return orders.filter((o) => orderAttention(o, now) != null);
}

/** Order money: what we charged (net of refunds), what the printer charges us, and the difference. */
export function orderMoney(order: AdminUserOrderSummary): {
  chargedCents: number | null;
  costCents: number | null;
  marginCents: number | null;
  marginPct: number | null;
} {
  const charged = order.totalCents;
  const counted = order.status !== "canceled" && order.status !== "refunded";
  const cost = order.fulfillment === "digital" ? 0 : order.luluCostCents;
  if (charged == null || !counted) return { chargedCents: charged, costCents: cost, marginCents: null, marginPct: null };
  if (cost == null) return { chargedCents: charged, costCents: null, marginCents: null, marginPct: null };
  // Sales tax is collected for the state, not earned; leave it out of the margin base.
  const base = charged - (order.fulfillment === "digital" ? 0 : (order.taxCents ?? 0));
  const margin = charged - cost;
  return { chargedCents: charged, costCents: cost, marginCents: margin, marginPct: base > 0 ? (margin / base) * 100 : null };
}
