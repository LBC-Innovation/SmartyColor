"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { BookCoverCanvas } from "@/components/v2/book-order/BookCoverCanvas";
import type { BookOrder } from "@/components/v2/studio/order/useBookOrder";
import type { BookBindingId } from "@/lib/print/bookBindings";

/**
 * The book being built, as one card beside the gallery (desktop): the cover and title on top,
 * the steps in a scrolling middle, and the buy button pinned at the bottom. Closing it keeps the
 * book; the gallery's book card picks it back up. It is docked to the window's bottom edge: it
 * rises from there when opened and sinks back when closed.
 */
export function BookOrderCard({
  order,
  onClose,
  footer,
  leaving = false,
  children,
}: {
  order: BookOrder;
  onClose: () => void;
  footer?: ReactNode;
  /** True while it sinks back down after closing. */
  leaving?: boolean;
  children: ReactNode;
}) {
  const printed = !order.isDigital && order.formatChosen;
  const facts = [
    `${order.contentCount} ${order.contentCount === 1 ? "page" : "pages"}`,
    order.formatChosen ? order.binding.shortLabel : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-label="Your book"
      aria-hidden={leaving || undefined}
      // Only the top corners round. The shadow stays within the 16px above the card, where the
      // studio's frame would otherwise clip it.
      className={`${leaving ? "cm-dock-sink" : "cm-dock-rise"} flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-3xl rounded-b-none border border-b-0 border-gray-200 bg-white shadow-[0_0_20px_-6px_rgb(30_27_75/0.22)]`}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-100 bg-gradient-to-br from-v2-primary-light/70 to-white px-5 py-4">
        <div className="w-11 shrink-0 overflow-hidden rounded-sm shadow-md ring-1 ring-black/5">
          {printed && order.signedIn && order.coverChoices.layout ? (
            <BookCoverCanvas
              design={order.coverDesign}
              sources={order.coverSources}
              bindingId={order.bindingId as BookBindingId}
              loading={order.coverPicturesLoading}
              className="w-full"
            />
          ) : (
            <span className="block aspect-[3/4] w-full bg-v2-primary/80" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="v2-brand-title truncate text-lg leading-tight text-v2-ink">Your book</h2>
          <p className="truncate text-sm text-v2-muted" title={order.coverTitle}>
            <span className="text-v2-ink">{order.coverTitle}</span>
            {facts ? ` · ${facts}` : null}
          </p>
        </div>
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-v2-navy hover:bg-white/80"
          aria-label="Close your book. It stays saved."
          title="Close (your book stays saved)"
          onClick={onClose}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4">{children}</div>
      {footer ? <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-4">{footer}</div> : null}
    </section>
  );
}

/** How long the card takes to sink back down; matches `.cm-dock-sink`. */
const SINK_MS = 360;

/**
 * Keeps the book card on screen for a moment after it closes, so it can sink back down instead
 * of vanishing. `children` gets `leaving`, true while it sinks.
 */
export function DockedBookPresence({ open, children }: { open: boolean; children: (leaving: boolean) => ReactNode }) {
  const [shown, setShown] = useState(open);
  // Opening shows it right away (during render, so the gallery and the card move together).
  if (open && !shown) setShown(true);
  useEffect(() => {
    if (open || !shown) return;
    const timer = setTimeout(() => setShown(false), SINK_MS);
    return () => clearTimeout(timer);
  }, [open, shown]);
  return shown ? children(!open) : null;
}
