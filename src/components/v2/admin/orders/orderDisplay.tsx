"use client";

import { ORDER_STATUS_TONE } from "@/components/v2/admin/format";
import { StatusPill } from "@/components/v2/admin/ui";
import { orderPagesLabel } from "@/lib/orders/blankBacks";
import { statusLabel } from "@/lib/orders/fulfillmentTimeline";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";

/** "Printed · Spiral · 24 pages" / "Print at home · 24 pages". */
/** "Spiral", "Stapled" or "Paperback" from the print product's name. */
export function bindingLabel(productName: string): string | null {
  const name = productName.toLowerCase();
  if (name.includes("spiral") || name.includes("coil")) return "Spiral";
  if (name.includes("saddle")) return "Stapled";
  if (name.includes("perfect")) return "Paperback";
  return null;
}

/** Short form for tables: "Printed · Spiral · 8 pages". */
export function bookLabel(order: AdminUserOrderSummary): string {
  const pages = orderPagesLabel(order.pageCount, order.blankBacks, { lined: order.linedBacks });
  if (order.fulfillment === "digital") return `Print at home · ${pages}`;
  const binding = bindingLabel(order.productName);
  return ["Printed", binding, pages].filter(Boolean).join(" · ");
}

/** Full form for the order drawer, with the product name and the printed side count. */
export function bookLabelLong(order: AdminUserOrderSummary): string {
  const pages = orderPagesLabel(order.pageCount, order.blankBacks, { withPrinted: true, lined: order.linedBacks });
  if (order.fulfillment === "digital") return `Print at home · ${pages}`;
  return `${order.productName} · ${pages}`;
}

export function orderTitle(order: AdminUserOrderSummary): string {
  return order.projectTitle?.trim() || order.productName;
}

export function customerLabel(order: AdminUserOrderSummary): string | null {
  return order.userEmail ?? order.contactEmail ?? null;
}

export function OrderStatusPill({ order }: { order: AdminUserOrderSummary }) {
  const label = order.fulfillment === "digital" && order.status === "paid" ? "Ready to download" : statusLabel(order.status);
  const tone = order.fulfillment === "digital" && order.status === "paid" ? "good" : ORDER_STATUS_TONE[order.status];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

export type OrderTab = "attention" | "progress" | "shipped" | "canceled" | "all";

const PROGRESS = new Set(["awaiting_payment", "paid", "submitting_to_lulu", "submitted_to_lulu", "in_production"]);

export function inTab(order: AdminUserOrderSummary, tab: OrderTab, needsAttention: boolean): boolean {
  switch (tab) {
    case "attention":
      return needsAttention;
    case "progress":
      // A paid print-at-home order is finished: the customer downloads it.
      return PROGRESS.has(order.status) && !(order.fulfillment === "digital" && order.status === "paid");
    case "shipped":
      return order.status === "shipped" || order.status === "delivered" || (order.fulfillment === "digital" && order.status === "paid");
    case "canceled":
      return order.status === "canceled" || order.status === "refunded";
    case "all":
      return true;
  }
}
