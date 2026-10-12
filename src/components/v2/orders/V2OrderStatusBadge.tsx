import { statusLabel } from "@/lib/orders/fulfillmentTimeline";
import type { BookFulfillment, BookOrderStatus } from "@/lib/orders/types";
import { cn } from "@/lib/cn";

const TONE: Partial<Record<BookOrderStatus, string>> = {
  shipped: "bg-sky-100 text-sky-900",
  delivered: "bg-emerald-100 text-emerald-900",
  in_production: "bg-violet-100 text-violet-900",
  failed: "bg-red-100 text-red-900",
  canceled: "bg-gray-100 text-gray-700",
};

export function V2OrderStatusBadge({
  status,
  fulfillment = "print",
}: {
  status: BookOrderStatus;
  fulfillment?: BookFulfillment;
}) {
  // A paid digital order is done: there is nothing to ship.
  if (fulfillment === "digital" && status === "paid") {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
        Ready to print
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TONE[status] ?? "bg-v2-primary-light text-v2-link",
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
