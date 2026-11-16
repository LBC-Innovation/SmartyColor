import { BookOpen, FileDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BookOrderSummary } from "@/lib/orders/types";

/**
 * The book's front cover (or a print-at-home PDF's first picture page) at list size, in the
 * cover's own 8.5 × 11 shape. The URL points at a ~480px WebP, never the print file. Until that
 * thumbnail has been made, an icon stands in.
 */
export function V2OrderThumb({ order, className }: { order: BookOrderSummary; className?: string }) {
  const box = "aspect-[8.5/11] shrink-0 overflow-hidden rounded-md";
  if (order.thumbUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={order.thumbUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn(box, "border border-gray-200 bg-white object-cover shadow-sm", className)}
      />
    );
  }
  const Icon = order.fulfillment === "digital" ? FileDown : BookOpen;
  return (
    <span className={cn(box, "flex items-center justify-center bg-v2-primary-light text-v2-primary", className)} aria-hidden>
      <Icon className="h-5 w-5" />
    </span>
  );
}
