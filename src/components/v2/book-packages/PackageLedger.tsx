import { BOOK_PACKAGES } from "@/content/marketing";
import { fillPackageCopy } from "@/lib/bookPackages/copy";
import type { PackagePaymentPlan } from "@/lib/bookPackages/topUpPurchase";
import type { BookPackageShippingQuote } from "@/lib/bookPackages/types";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <dt>{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The pay screen's ledger: each charge (package, shipping, tax), the total, what the credit pays,
 * and what is left for the card.
 */
export function PackageLedger({
  packageCents,
  shippingMode,
  quote,
  plan,
}: {
  packageCents: number;
  shippingMode: "now" | "later";
  quote: BookPackageShippingQuote | null;
  plan: PackagePaymentPlan;
}) {
  const shippingOnlyCents = quote ? quote.shippingCents - quote.taxCents : 0;

  return (
    <section className="mt-6" aria-labelledby="package-ledger-heading">
      <h2 id="package-ledger-heading" className="text-sm font-semibold text-v2-ink">
        {BOOK_PACKAGES.ledgerHeading}
      </h2>
      <dl className="mt-2 space-y-1.5 rounded-xl bg-v2-bg-subtle px-4 py-3 text-sm text-v2-ink">
        <Row label={BOOK_PACKAGES.ledgerPackage} value={formatCredits(packageCents)} />
        {quote ? (
          <>
            <Row label={BOOK_PACKAGES.ledgerShipping} value={formatCredits(shippingOnlyCents)} />
            {quote.taxCents > 0 ? <Row label={BOOK_PACKAGES.ledgerTax} value={formatCredits(quote.taxCents)} /> : null}
          </>
        ) : shippingMode === "now" ? (
          <Row
            label={BOOK_PACKAGES.ledgerShippingPending}
            value={BOOK_PACKAGES.ledgerShippingPendingValue}
            className="text-v2-muted"
          />
        ) : (
          <Row
            label={BOOK_PACKAGES.ledgerShippingLater}
            value={BOOK_PACKAGES.ledgerShippingLaterValue}
            className="text-v2-muted"
          />
        )}

        <Row
          label={BOOK_PACKAGES.ledgerTotal}
          value={formatCredits(plan.totalCents)}
          className="border-t border-gray-200 pt-2 font-semibold"
        />
        {plan.creditCents > 0 ? (
          <Row
            label={BOOK_PACKAGES.ledgerCredit}
            value={`−${formatCredits(plan.creditCents)}`}
            className="font-medium text-v2-success-text"
          />
        ) : null}

        <Row
          label={plan.cardCents > 0 ? BOOK_PACKAGES.ledgerDueCard : BOOK_PACKAGES.ledgerDueNothing}
          value={formatCredits(plan.cardCents)}
          className="border-t-2 border-gray-300 pt-2 text-base font-bold"
        />
      </dl>

      {plan.route === "topup" ? <p className="mt-2 text-xs text-v2-muted">{BOOK_PACKAGES.ledgerTopUpNote}</p> : null}
      {plan.creditCents > 0 && plan.balanceAfterCents > 0 ? (
        <p className="mt-2 text-xs text-v2-muted">
          {fillPackageCopy(BOOK_PACKAGES.ledgerCreditAfter, { balanceAfter: formatCredits(plan.balanceAfterCents) })}
        </p>
      ) : null}
    </section>
  );
}
