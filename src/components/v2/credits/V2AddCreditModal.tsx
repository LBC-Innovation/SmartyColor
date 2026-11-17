"use client";

import { Wallet } from "lucide-react";
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
  /** What the shortfall is for, e.g. "this book". */
  shortfallFor?: string;
};

/** Pick an amount, then hand off to Stripe Checkout for card entry. */
export function V2AddCreditModal({ onClose, returnPath, shortfallCents, shortfallFor = "this book" }: Props) {
  const { user } = useAuth();
  const balance = user?.creditsBalanceCents ?? 0;

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-md"
      icon={<Wallet />}
      tone="success"
      title="Add credit"
      description={
        <>
            {shortfallCents && shortfallCents > 0
              ? `${balance > 0 ? `Your credit covers ${formatCredits(balance)}. ` : ""}Add ${formatCredits(shortfallCents)} for ${shortfallFor}, or add more for later.`
              : (
                <>
                  Balance{" "}
                  <span className="font-semibold tabular-nums text-v2-success-text">{formatCredits(balance)}</span>
                </>
              )}
        </>
      }
    >
      <div className="px-5 pb-6 pt-1 sm:px-7">
        <V2AddCreditForm returnPath={returnPath} suggestedCents={shortfallCents} />
      </div>
    </V2Modal>
  );
}
