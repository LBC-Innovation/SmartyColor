"use client";

import { V2Modal } from "@/components/v2/ui/V2Modal";
import { V2AddCreditForm } from "@/components/v2/credits/V2AddCreditForm";
import { useAuth } from "@/context/AuthContext";
import { formatCredits } from "@/lib/credits/money";

type Props = {
  onClose: () => void;
  /** Where Stripe sends the user back; `?credits=success|canceled` is appended. */
  returnPath: string;
  /** Amount still needed for the thing they're buying, if any. */
  shortfallCents?: number | null;
};

/** Pick an amount, then hand off to Stripe Checkout for card entry. */
export function V2AddCreditModal({ onClose, returnPath, shortfallCents }: Props) {
  const { user } = useAuth();
  const balance = user?.creditsBalanceCents ?? 0;

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={
        <div>
          <h2 className="text-lg font-semibold text-v2-ink">Add credit</h2>
          <p className="mt-0.5 text-sm text-v2-muted">
            Balance{" "}
            <span className="font-semibold tabular-nums text-v2-success-text">{formatCredits(balance)}</span>
            {shortfallCents && shortfallCents > 0 ? (
              <>
                {" "}
                · you need{" "}
                <span className="font-semibold tabular-nums text-v2-ink">{formatCredits(shortfallCents)}</span>{" "}
                more for this book
              </>
            ) : null}
          </p>
        </div>
      }
    >
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <V2AddCreditForm returnPath={returnPath} suggestedCents={shortfallCents} />
      </div>
    </V2Modal>
  );
}
