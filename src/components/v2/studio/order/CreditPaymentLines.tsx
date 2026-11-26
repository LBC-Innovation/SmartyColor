import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";

/**
 * The rows under a price box's "Total": what comes out of the customer's credit, then what is left
 * for the card ("Due on card"), or "Left to pay $0.00" when the credit covers it. Rendered inside
 * the box's <dl>. Nothing when there is nothing to pay or the balance isn't known (guests).
 */
export function CreditPaymentLines({
  dueCents,
  balanceCents,
  className,
}: {
  dueCents: number | null;
  balanceCents: number | null;
  className?: string;
}) {
  if (dueCents == null || dueCents <= 0 || balanceCents == null) return null;
  const fromCredit = Math.min(Math.max(0, balanceCents), dueCents);
  const onCard = dueCents - fromCredit;
  const creditAfter = Math.max(0, balanceCents) - fromCredit;

  return (
    <>
      {fromCredit > 0 ? (
        <div className={cn("flex items-baseline justify-between gap-3 font-medium text-v2-success-text", className)}>
          <dt>From your wallet balance</dt>
          <dd className="shrink-0 tabular-nums">−{formatCredits(fromCredit)}</dd>
        </div>
      ) : null}
      <div
        className={cn(
          "flex items-baseline justify-between gap-3 border-t-2 border-gray-300 pt-1.5 font-bold text-v2-ink",
          className,
        )}
      >
        <dt>{onCard > 0 ? "Due on card" : "Left to pay"}</dt>
        <dd className="shrink-0 tabular-nums">{formatCredits(onCard)}</dd>
      </div>
      {fromCredit > 0 && creditAfter > 0 ? (
        // Plain text in a dark gray-green, with room above and below so it sits apart from the
        // ledger and from what follows (not given `className`, which would fight its spacing).
        <div className="mb-3 mt-4 flex items-baseline justify-between gap-3 text-sm font-semibold text-emerald-950/75">
          <dt>Your remaining wallet balance after this</dt>
          <dd className="shrink-0 tabular-nums">{formatCredits(creditAfter)}</dd>
        </div>
      ) : null}
    </>
  );
}
