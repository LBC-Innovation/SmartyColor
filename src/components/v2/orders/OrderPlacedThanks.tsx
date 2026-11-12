import { CheckCircle2 } from "lucide-react";
import { CONTACT_EMAIL } from "@/content/marketing";
import { statusLabel } from "@/lib/orders/fulfillmentTimeline";
import type { BookOrderDetail } from "@/lib/orders/types";
import { cn } from "@/lib/cn";

/** Plain-language meaning of each stage on the order page, in the order they happen. */
const STAGE_COPY: Record<string, string> = {
  placed:
    "Your payment is confirmed and your book is sent to the printer. They have a short window to review it before production starts.",
  production: "Your pages are printed and bound. This typically takes a few business days.",
  shipped: "Your package is on its way. Tracking appears on this page.",
  delivered: "The carrier confirms delivery to your address.",
};

/** Thank-you header and "what happens next" guide for a printed-book order that was just placed. */
export function OrderPlacedThanks({
  order,
  onCancel,
}: {
  order: BookOrderDetail;
  /** Set while the order can still be canceled. */
  onCancel?: () => void;
}) {
  const contact = order.contactEmail?.trim();
  const dispatch = order.estimatedDispatchMax ?? order.estimatedDispatchMin;
  return (
    <section
      className="v2-panel mb-6 border-emerald-200 bg-emerald-50/70 p-4 sm:p-6"
      aria-labelledby="order-thanks-title"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0">
          <h2
            id="order-thanks-title"
            className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl"
          >
            Thanks for placing an order!
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-v2-ink">
            Your book is paid for and on its way to the printer.{" "}
            {contact ? (
              <>
                We&apos;ve emailed your order details to{" "}
                <span className="font-semibold break-words">{contact}</span>.
              </>
            ) : (
              "We've emailed your order details."
            )}
          </p>
        </div>
      </div>

      <h3 className="mt-5 text-sm font-semibold uppercase tracking-wider text-v2-muted">
        Where your order is
      </h3>
      <p className="mt-1 text-sm text-v2-muted">
        The status at the top of this page, currently{" "}
        <span className="font-semibold text-v2-ink">{statusLabel(order.status)}</span>, and the
        Fulfillment steps below show where your book is. The page updates as the printer reports
        progress, so check back anytime.
      </p>
      <ol className="mt-3 space-y-2">
        {order.timeline.map((step) => (
          <li
            key={step.id}
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              step.state === "current" ? "bg-white shadow-sm" : "bg-white/60",
            )}
          >
            <p className="font-semibold text-v2-ink">
              {step.label}
              {step.state === "current" ? (
                <span className="ml-2 text-xs font-semibold text-emerald-700">You are here</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-v2-muted">{STAGE_COPY[step.id] ?? step.description}</p>
          </li>
        ))}
      </ol>

      {dispatch ? (
        <p className="mt-3 text-sm text-v2-muted">
          The printer estimates your book will ship by{" "}
          {new Date(dispatch).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          . Estimates can shift, and we&apos;ll show any change here.
        </p>
      ) : null}

      <h3 className="mt-5 text-sm font-semibold uppercase tracking-wider text-v2-muted">
        What to expect next
      </h3>
      <p className="mt-1 text-sm text-v2-muted">
        Look for a confirmation email now, then keep an eye on this page for production and
        shipping updates. Questions? Reply to the confirmation email or write to{" "}
        <a className="font-semibold text-v2-link hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      {onCancel ? (
        <p className="mt-3 text-sm text-v2-muted">
          Changed your mind? You can cancel for a full refund to your wallet until your book goes
          into production
          {order.luluProductionDueAt
            ? `, around ${new Date(order.luluProductionDueAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`
            : ", usually about an hour after you order"}
          .{" "}
          <button
            type="button"
            onClick={onCancel}
            className="font-semibold text-rose-700 underline-offset-2 hover:underline"
          >
            Cancel order
          </button>
        </p>
      ) : null}
    </section>
  );
}
