"use client";

import Link from "next/link";
import { ChevronRight, ExternalLink, Truck } from "lucide-react";
import { V2OrderStatusBadge } from "@/components/v2/orders/V2OrderStatusBadge";
import { isUnpaid, orderTitle } from "@/components/v2/orders/V2MyOrdersStudio";
import { cn } from "@/lib/cn";
import { formatDeliveryExpectation } from "@/lib/orders/fulfillmentTimeline";
import type { BookOrderSummary } from "@/lib/orders/types";

/** The carrier's tracking page, once the printer has shipped the book. */
export function trackingUrlFor(order: BookOrderSummary): string | null {
  return order.fulfillment !== "digital" && order.status === "shipped" ? (order.trackingUrls[0] ?? null) : null;
}

function detailFor(order: BookOrderSummary): string | null {
  if (isUnpaid(order)) return "Not paid yet. Finish it to send it to print.";
  if (order.fulfillment === "digital") return null;
  return formatDeliveryExpectation(order.estimatedDeliveryMin, order.estimatedDeliveryMax, order.status) || null;
}

/**
 * One order as a single tap target: anywhere on the card opens the order, including the space
 * around the buttons. "Track package" sits inside the card as its own button and goes to the
 * carrier instead. The card's link is stretched over the whole card (not wrapped around it), so
 * the inner button stays a real, separate control for keyboards and screen readers.
 */
export function V2OrderTrackCard({ order, className }: { order: BookOrderSummary; className?: string }) {
  const trackingUrl = trackingUrlFor(order);
  const detail = detailFor(order);
  const unpaid = isUnpaid(order);

  return (
    <article
      className={cn(
        "v2-panel group relative flex flex-col gap-2 p-4 transition hover:border-v2-primary/40 hover:shadow-md",
        "focus-within:border-v2-primary/50 active:scale-[0.99] motion-reduce:active:scale-100",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-v2-primary-light text-v2-primary" aria-hidden>
          <Truck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-v2-ink">
            <Link
              href={`/orders/${order.id}`}
              className={cn(
                "outline-none",
                // The link's hit area covers the whole card.
                "after:absolute after:inset-0 after:z-0 after:rounded-[inherit] after:content-['']",
                "focus-visible:after:ring-2 focus-visible:after:ring-v2-primary focus-visible:after:ring-offset-2",
              )}
            >
              {orderTitle(order)}
            </Link>
          </h3>
          <div className="mt-1">
            <V2OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
          </div>
        </div>
        <ChevronRight
          className="mt-2.5 h-5 w-5 shrink-0 text-v2-muted transition-transform group-hover:translate-x-0.5 group-hover:text-v2-primary"
          aria-hidden
        />
      </div>

      {detail ? <p className="text-sm text-v2-muted">{detail}</p> : null}

      {trackingUrl ? (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          // Above the stretched link, so this one tap goes to the carrier, not the order.
          className="v2-btn-outline relative z-10 mt-1 min-h-11 self-start text-sm"
        >
          <Truck className="h-4 w-4" aria-hidden />
          Track package
          <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
          <span className="sr-only">(opens the carrier&apos;s site in a new tab)</span>
        </a>
      ) : unpaid ? (
        // Same place as the card, so not a second link: just says what tapping does.
        <span className="mt-1 inline-flex min-h-9 items-center self-start rounded-full bg-v2-primary px-4 text-sm font-semibold text-white" aria-hidden>
          Finish and pay
        </span>
      ) : null}
    </article>
  );
}
