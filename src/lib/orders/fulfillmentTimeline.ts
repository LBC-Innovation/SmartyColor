import type { BookOrderStatus, FulfillmentStep } from "@/lib/orders/types";

const STEP_DEFS: Array<{
  id: string;
  label: string;
  description: string;
  reachedWhen: BookOrderStatus[];
}> = [
  {
    id: "placed",
    label: "Order placed",
    description: "Payment confirmed and your book is queued for printing.",
    reachedWhen: [
      "paid",
      "submitting_to_lulu",
      "submitted_to_lulu",
      "in_production",
      "shipped",
      "delivered",
    ],
  },
  {
    id: "production",
    label: "Printing",
    description: "Your coloring pages are being printed and bound.",
    reachedWhen: ["in_production", "shipped", "delivered"],
  },
  {
    id: "shipped",
    label: "Shipped",
    description: "Your package is on the way. Tracking may take a few hours to activate.",
    reachedWhen: ["shipped", "delivered"],
  },
  {
    id: "delivered",
    label: "Delivered",
    description: "Carrier confirmed delivery to your address.",
    reachedWhen: ["delivered"],
  },
];

const STATUS_RANK: Record<BookOrderStatus, number> = {
  draft: 0,
  quoted: 0,
  awaiting_payment: 0,
  paid: 1,
  submitting_to_lulu: 1,
  submitted_to_lulu: 1,
  in_production: 2,
  shipped: 3,
  delivered: 4,
  failed: -1,
  canceled: -1,
  refunded: -1,
};

function rankForStatus(status: BookOrderStatus): number {
  if (status === "failed" || status === "canceled" || status === "refunded") {
    return STATUS_RANK.paid;
  }
  return STATUS_RANK[status] ?? 0;
}

export function buildFulfillmentTimeline(input: {
  status: BookOrderStatus;
  paidAt: string | null;
  submittedToLuluAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}): FulfillmentStep[] {
  const rank = rankForStatus(input.status);
  const timestamps: Record<string, string | null> = {
    placed: input.paidAt ?? input.submittedToLuluAt,
    production: input.submittedToLuluAt ?? input.paidAt,
    shipped: input.shippedAt,
    delivered: input.deliveredAt,
  };

  const currentStepId = ((): string => {
    if (input.status === "delivered") return "delivered";
    if (input.status === "shipped") return "shipped";
    if (input.status === "in_production") return "production";
    if (
      input.status === "paid" ||
      input.status === "submitting_to_lulu" ||
      input.status === "submitted_to_lulu"
    ) {
      return rank >= 2 ? "production" : "placed";
    }
    if (rank >= 1) return "placed";
    return "placed";
  })();

  return STEP_DEFS.map((step, index) => {
    const stepRank = index + 1;
    let state: FulfillmentStep["state"] = "upcoming";
    if (rank >= stepRank && input.status !== "failed" && input.status !== "canceled") {
      state = "complete";
    }
    if (step.id === currentStepId && input.status !== "delivered") {
      state = "current";
    }
    if (input.status === "delivered") {
      state = "complete";
    }

    return {
      id: step.id,
      label: step.label,
      description: step.description,
      state,
      occurredAt: timestamps[step.id] ?? null,
    };
  });
}

export function formatDeliveryExpectation(
  min: string | null,
  max: string | null,
  status: BookOrderStatus,
): string | null {
  if (status === "delivered") return "Delivered";
  if (status === "shipped") {
    return min && max ? `Estimated arrival ${formatDateRange(min, max)}` : "On the way — check tracking for updates";
  }
  if (status === "canceled" || status === "failed" || status === "refunded") {
    return null;
  }
  if (min && max) {
    return `Estimated delivery ${formatDateRange(min, max)}`;
  }
  return "Delivery estimate will appear once your order is sent to the printer.";
}

function formatDateRange(minIso: string, maxIso: string): string {
  const min = new Date(minIso);
  const max = new Date(maxIso);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const sameMonth =
    min.getFullYear() === max.getFullYear() && min.getMonth() === max.getMonth();
  if (sameMonth) {
    return `${min.toLocaleDateString(undefined, opts)}–${max.getDate()}, ${max.getFullYear()}`;
  }
  return `${min.toLocaleDateString(undefined, opts)} – ${max.toLocaleDateString(undefined, opts)}, ${max.getFullYear()}`;
}

export function statusLabel(status: BookOrderStatus): string {
  const labels: Record<BookOrderStatus, string> = {
    draft: "Draft",
    quoted: "Quoted",
    awaiting_payment: "Awaiting payment",
    paid: "Order placed",
    submitting_to_lulu: "Sending to printer",
    submitted_to_lulu: "With printer",
    in_production: "Printing",
    shipped: "Shipped",
    delivered: "Delivered",
    failed: "Needs attention",
    canceled: "Canceled",
    refunded: "Refunded",
  };
  return labels[status];
}
