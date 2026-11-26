"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
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
  /** False when another hook on the same page handles the return (only one may). */
  enabled?: boolean;
};

/**
 * Where a card top-up stands after the trip to Stripe, so a pay button can stand down while the
 * payment is being confirmed instead of inviting a second payment:
 * - `confirming`: back from Stripe, the credit isn't on the balance yet (checked every few seconds);
 * - `slow`: still not confirmed after about a minute (the webhook usually lands soon after);
 * - `bank`: a bank payment that clears in days.
 */
export type TopUpStatus =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "slow" }
  | { kind: "bank"; amountCents: number };

const IDLE: TopUpStatus = { kind: "idle" };
let topUpStatus: TopUpStatus = IDLE;
const listeners = new Set<() => void>();
function setTopUpStatus(next: TopUpStatus) {
  topUpStatus = next;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current top-up's status, for pay buttons anywhere on the page. */
export function useTopUpStatus(): TopUpStatus {
  return useSyncExternalStore(
    subscribe,
    () => topUpStatus,
    () => IDLE,
  );
}

/** Set by the page handling the return: asks Stripe again now (from the "slow" state). */
let recheck: (() => void) | null = null;
export function recheckTopUp(): void {
  recheck?.();
}

const POLL_MS = 3000;
const POLL_TRIES = 20;

/**
 * Handles landing back on a page from Stripe Checkout. On success it has the
 * server verify the payment with Stripe and credit the wallet, then shows the
 * new balance; it only says credit was added once that has actually happened.
 * Until then `useTopUpStatus()` reads `confirming`, and it keeps asking for about a minute.
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
    if (latest.current.options.enabled === false) return;
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

    /** The webhook may have credited the wallet even when we could not confirm it. */
    const refreshAnyway = async () => {
      await latest.current.refreshUser();
      latest.current.options.onBalanceChanged?.();
    };

    if (!sessionId) {
      void refreshAnyway().then(() =>
        latest.current.toast.info("Your balance updates as soon as the payment is confirmed.", "Payment received"),
      );
      return;
    }

    const stopped = false;
    let timer: number | undefined;

    /** One check with Stripe. True when it is settled (credited or left to the bank). */
    const attempt = async (): Promise<boolean> => {
      const result = await api.confirmCreditTopUp(sessionId);
      if (stopped) return true;
      if (api.isError(result)) {
        // Asking again won't change these: nothing was charged, so the pay button comes back.
        if (result.error.code === "NOT_PAID" || result.error.code === "NOT_FOUND") {
          setTopUpStatus(IDLE);
          latest.current.toast.info(
            result.error.code === "NOT_PAID" ? "That payment wasn't completed, so nothing was added to your wallet." : result.error.message,
            "Nothing added to your wallet",
          );
          return true;
        }
        return false;
      }
      if (result.data.status === "pending") {
        setTopUpStatus({ kind: "bank", amountCents: result.data.amountCents });
        latest.current.toast.info(
          `Your ${formatCredits(result.data.amountCents)} will be added once your bank confirms the payment. That can take a few days.`,
          "Payment processing",
        );
        return true;
      }
      // Show the new balance now, then re-read the account: on a fresh page load
      // the session restore may still be in flight with the old balance.
      latest.current.setCreditsBalance(result.data.creditsBalanceCents);
      latest.current.options.onBalanceChanged?.();
      void latest.current.refreshUser();
      setTopUpStatus(IDLE);
      const hint = latest.current.options.creditedHint;
      latest.current.toast.success({
        title: "Added to your wallet",
        message: `${formatCredits(result.data.amountCents)} was added to your balance.${hint ? ` ${hint}` : ""}`,
      });
      return true;
    };

    const poll = async (triesLeft: number) => {
      if (stopped) return;
      if (await attempt()) return;
      if (stopped) return;
      if (triesLeft <= 1) {
        await refreshAnyway();
        if (stopped) return;
        setTopUpStatus({ kind: "slow" });
        latest.current.toast.error(
          "We could not confirm your payment just now. If you were charged, it will show up in your wallet balance shortly.",
          "Not in your wallet yet",
        );
        return;
      }
      timer = window.setTimeout(() => void poll(triesLeft - 1), POLL_MS);
    };

    recheck = () => {
      window.clearTimeout(timer);
      setTopUpStatus({ kind: "confirming" });
      void poll(1);
    };
    // Deliberately not cancelled on unmount (the URL is already clean, so a remount can't restart it):
    // the payment still needs confirming, and the tries are bounded.
    setTopUpStatus({ kind: "confirming" });
    void poll(POLL_TRIES);
  }, []);
}
