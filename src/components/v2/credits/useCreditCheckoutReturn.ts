"use client";

import { useEffect, useRef } from "react";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import { CHECKOUT_SESSION_PARAM, CREDITS_RETURN_PARAM } from "@/lib/credits/types";

type Options = {
  /** Runs once the wallet has (or may have) changed, e.g. to re-fetch a ledger. */
  onBalanceChanged?: () => void;
  /** Added to the "credit added" message, e.g. "You can finish your order." */
  creditedHint?: string;
};

/**
 * Handles landing back on a page from Stripe Checkout. On success it has the
 * server verify the payment with Stripe and credit the wallet, then shows the
 * new balance; it only says credit was added once that has actually happened.
 */
export function useCreditCheckoutReturn(options: Options = {}): void {
  const toast = useV2Toast();
  const { refreshUser, setCreditsBalance } = useAuth();
  // Read through a ref so the mount-only effect sees the latest handlers.
  const latest = useRef({ options, toast, refreshUser, setCreditsBalance });
  useEffect(() => {
    latest.current = { options, toast, refreshUser, setCreditsBalance };
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get(CREDITS_RETURN_PARAM);
    if (!outcome) return;
    const sessionId = url.searchParams.get(CHECKOUT_SESSION_PARAM);

    // Clean the URL first so a refresh (or a second mount) doesn't repeat this.
    url.searchParams.delete(CREDITS_RETURN_PARAM);
    url.searchParams.delete(CHECKOUT_SESSION_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());

    if (outcome === "canceled") {
      latest.current.toast.info("No charge was made.", "Payment canceled");
      return;
    }
    if (outcome !== "success") return;

    // Deliberately not cancelled on unmount: the payment still needs confirming.
    void (async () => {
      /** The webhook may have credited the wallet even when we could not confirm it. */
      const refreshAnyway = async () => {
        await latest.current.refreshUser();
        latest.current.options.onBalanceChanged?.();
      };

      if (!sessionId) {
        await refreshAnyway();
        latest.current.toast.info(
          "Your balance updates as soon as the payment is confirmed.",
          "Payment received",
        );
        return;
      }

      const result = await api.confirmCreditTopUp(sessionId);
      if (api.isError(result)) {
        await refreshAnyway();
        latest.current.toast.error(
          "We could not confirm your payment just now. If you were charged, the credit will show up shortly. Refresh this page in a moment.",
          "Credit not added yet",
        );
        return;
      }

      if (result.data.status === "pending") {
        latest.current.toast.info(
          `Your ${formatCredits(result.data.amountCents)} will be added once your bank confirms the payment. That can take a few days.`,
          "Payment processing",
        );
        return;
      }

      // Show the new balance now, then re-read the account: on a fresh page load
      // the session restore may still be in flight with the old balance.
      latest.current.setCreditsBalance(result.data.creditsBalanceCents);
      latest.current.options.onBalanceChanged?.();
      void latest.current.refreshUser();
      const hint = latest.current.options.creditedHint;
      latest.current.toast.success({
        title: "Credit added",
        message: `${formatCredits(result.data.amountCents)} was added to your balance.${hint ? ` ${hint}` : ""}`,
      });
    })();
  }, []);
}
