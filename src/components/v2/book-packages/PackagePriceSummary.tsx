"use client";

import { Check, Truck } from "lucide-react";
import { ExtraChip } from "@/components/v2/book-packages/AllowanceChips";
import { CreditPaymentLines } from "@/components/v2/studio/order/CreditPaymentLines";
import type { BookOrder } from "@/components/v2/studio/order/useBookOrder";
import { BOOK_PACKAGES } from "@/content/marketing";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";
import { shippingLevelLabel } from "@/lib/orders/shippingLevels";
import { BOOK_BINDINGS } from "@/lib/print/bookBindings";

function Line({
  label,
  value,
  tone = "ink",
  chip,
}: {
  label: string;
  value: string;
  tone?: "ink" | "green" | "muted";
  chip?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex min-w-0 items-center gap-2">
        <span className="min-w-0">{label}</span>
        {chip}
      </dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums",
          tone === "green" && "font-semibold text-v2-success-text",
          tone === "ink" && "text-v2-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The price box for an album with a book package. It leads with what the customer pays (shipping
 * and its tax, plus any pages past the package), and shows printing as included. Anything extra
 * says what it is: more pages than included, another binding, or the shipping speed.
 */
export function PackagePriceSummary({
  order,
  onSwitchBack,
}: {
  order: BookOrder;
  /** Put the book back on the package's own binding. */
  onSwitchBack: () => void;
}) {
  const pkg = order.albumPurchaseCode;
  if (!pkg) return null;
  const pkgBinding = pkg.bundle.bindingId;
  const tokens = packageTokens({ bindingId: pkgBinding, includedPhotos: pkg.bundle.includedPages, editsPerPhoto: pkg.bundle.editsPerPage });
  const onPackageBinding = !order.isDigital && order.bindingId === pkgBinding;
  const ready = !order.quoteLoading && order.quoteCents != null && order.dueCents != null;
  const due = order.dueCents ?? 0;
  // The headline is what goes on a card for this order: nothing when credit covers it. The ledger
  // below shows the full total and what the credit pays.
  const onCard = order.balanceCents != null ? order.shortfallCents : due;
  const shipping = order.shippingCents ?? 0;
  const tax = order.taxCents ?? 0;
  const moreThanIncluded = Math.max(0, order.contentCount - pkg.bundle.includedPages);
  // Shipping paid with the package, as far as this order uses it (it never pays more than the
  // order's own shipping and tax here; anything else it covers shows up in "Total").
  const prepaid = Math.min(pkg.shippingPrepaidCents, shipping + tax);
  // What is left of the amount due once shipping and its tax are taken out: printing past the package.
  const extraPrint = onPackageBinding ? Math.max(0, due - (shipping + tax - prepaid)) : 0;
  const chosen = order.bindingId;
  const otherName = chosen === "digital" ? "print-at-home PDF" : BOOK_BINDINGS[chosen].shortLabel.toLowerCase();

  let sub: string;
  if (!ready) sub = "Checking your price…";
  else if (onPackageBinding && pkg.shippingPrepaidCents > 0 && due === 0) sub = BOOK_PACKAGES.orderAllPaid;
  else if (onPackageBinding && pkg.shippingPrepaidCents > 0)
    sub = fillPackageCopy(BOOK_PACKAGES.orderExtraWithShipping, tokens) ?? BOOK_PACKAGES.orderAllPaid;
  else if (onPackageBinding && extraPrint === 0) sub = BOOK_PACKAGES.orderPrintingIncluded;
  else if (onPackageBinding)
    sub = fillPackageCopy(BOOK_PACKAGES.orderExtraPages, { ...tokens, k: moreThanIncluded || "" }) ??
      "Your package pays for printing the photos it includes. The extra pages and shipping come from your credit.";
  else
    sub = fillPackageCopy(BOOK_PACKAGES.orderOtherBinding, { ...tokens, otherBindingNameLower: otherName }) ?? "";

  const speed = order.shippingChosen ? shippingLevelLabel(order.shippingLevel) : null;

  return (
    <div className="space-y-3 text-sm">
      <div
        className={cn("rounded-xl px-3 py-3", ready && onCard === 0 ? "bg-v2-success-bg text-v2-success-text" : "bg-white text-v2-ink")}
        role="status"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold">You pay</p>
          <p className="text-2xl font-bold tabular-nums">{ready ? formatCredits(onCard) : "…"}</p>
        </div>
        <p className="mt-1 text-xs leading-relaxed opacity-80">{sub}</p>
        {ready && !onPackageBinding ? (
          <button type="button" onClick={onSwitchBack} className="v2-hit-y mt-1 text-xs font-semibold text-v2-link">
            {BOOK_PACKAGES.orderSwitchBack}
          </button>
        ) : null}
      </div>

      {ready ? (
        <dl className="space-y-1 text-xs text-v2-muted">
          {onPackageBinding ? (
            <Line
              label={BOOK_PACKAGES.orderPrintingLine}
              value="Included"
              tone="green"
              chip={<Check className="h-3.5 w-3.5 text-v2-success-text" strokeWidth={3} aria-hidden />}
            />
          ) : (
            <Line label={`Printing, ${otherName}`} value={formatCredits(order.printCents ?? 0)} />
          )}
          {onPackageBinding && extraPrint > 0 ? (
            <Line
              label={fillPackageCopy(BOOK_PACKAGES.orderExtraLine, { k: moreThanIncluded || "more" }) ?? "Extra pages"}
              value={formatCredits(extraPrint)}
              chip={<ExtraChip label="extra" />}
            />
          ) : null}
          <Line
            label={speed ? `Shipping · ${speed}` : BOOK_PACKAGES.orderShippingChoose}
            value={speed ? formatCredits(shipping) : ""}
            chip={<Truck className="h-3.5 w-3.5" aria-hidden />}
          />
          <Line label="Sales tax" value={formatCredits(tax)} />
          {prepaid > 0 ? (
            <Line
              label={BOOK_PACKAGES.orderShippingPrepaidLine}
              value={`−${formatCredits(prepaid)}`}
              tone="green"
              chip={<Check className="h-3.5 w-3.5 text-v2-success-text" strokeWidth={3} aria-hidden />}
            />
          ) : null}
          <div className="border-t border-gray-200 pt-1">
            <Line label="Total" value={formatCredits(due)} tone="ink" />
          </div>
          <CreditPaymentLines dueCents={due} balanceCents={order.balanceCents} />
        </dl>
      ) : null}

      {ready && !order.addressComplete ? (
        <p className="text-xs text-v2-muted">Shipping and tax are estimated until the address is complete.</p>
      ) : null}
    </div>
  );
}
