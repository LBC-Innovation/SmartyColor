"use client";

import { useState } from "react";
import { CircleDollarSign, Loader2, Lock } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import { cn } from "@/lib/cn";

const QUICK_AMOUNTS_CENTS = [5_00, 10_00, 20_00, 50_00, 100_00];
const MIN_CENTS = 50;
const MAX_CENTS = 500_00;

type Props = {
  onClose: () => void;
  /** Where Stripe sends the user back; `?credits=success|canceled` is appended. */
  returnPath: string;
  /** Amount still needed for the thing they're buying, if any. */
  shortfallCents?: number | null;
};

function roundUpToQuick(cents: number): number {
  const match = QUICK_AMOUNTS_CENTS.find((q) => q >= cents);
  return match ?? Math.ceil(cents / 100) * 100;
}

function parseDollars(text: string): number | null {
  const n = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Pick an amount, then hand off to Stripe Checkout for card entry. */
export function V2AddCreditModal({ onClose, returnPath, shortfallCents }: Props) {
  const { user } = useAuth();
  const balance = user?.creditsBalanceCents ?? 0;
  const suggested = shortfallCents && shortfallCents > 0 ? roundUpToQuick(shortfallCents) : 10_00;
  const suggestedIsQuick = QUICK_AMOUNTS_CENTS.includes(suggested);

  const [mode, setMode] = useState<"quick" | "other">(suggestedIsQuick ? "quick" : "other");
  const [quick, setQuick] = useState<number>(suggestedIsQuick ? suggested : QUICK_AMOUNTS_CENTS[1]);
  const [otherText, setOtherText] = useState(suggestedIsQuick ? "" : (suggested / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = mode === "quick" ? quick : parseDollars(otherText);
  const amountError =
    mode === "other" && otherText.trim() && amountCents == null
      ? "Enter an amount in dollars."
      : amountCents != null && amountCents < MIN_CENTS
        ? `Minimum is ${formatCredits(MIN_CENTS)}.`
        : amountCents != null && amountCents > MAX_CENTS
          ? `Maximum is ${formatCredits(MAX_CENTS)} at a time.`
          : null;
  const canContinue = amountCents != null && !amountError && !busy;

  async function continueToPayment() {
    if (amountCents == null || amountError) return;
    setBusy(true);
    setError(null);
    const result = await api.createCreditTopUpCheckout({ amountCents, returnPath });
    if (api.isError(result)) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    window.location.href = result.data.checkoutUrl;
  }

  return (
    <V2Modal
      onClose={() => !busy && onClose()}
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
        <p className="v2-label">How much would you like to add?</p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_AMOUNTS_CENTS.map((cents) => {
            const on = mode === "quick" && quick === cents;
            return (
              <button
                key={cents}
                type="button"
                onClick={() => {
                  setMode("quick");
                  setQuick(cents);
                }}
                aria-pressed={on}
                className={cn(
                  "h-12 rounded-xl border text-base font-bold tabular-nums transition",
                  on
                    ? "border-v2-primary bg-v2-primary-light text-v2-link shadow-[0_0_0_3px_rgb(86_79_208/0.15)]"
                    : "border-gray-200 bg-white text-v2-ink hover:border-v2-primary/40",
                )}
              >
                {formatCredits(cents, { compact: true })}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMode("other")}
            aria-pressed={mode === "other"}
            className={cn(
              "h-12 rounded-xl border text-base font-bold transition",
              mode === "other"
                ? "border-v2-primary bg-v2-primary-light text-v2-link shadow-[0_0_0_3px_rgb(86_79_208/0.15)]"
                : "border-gray-200 bg-white text-v2-ink hover:border-v2-primary/40",
            )}
          >
            Other
          </button>
        </div>

        {mode === "other" ? (
          <div className="mt-3">
            <label htmlFor="add-credit-other" className="sr-only">
              Amount in dollars
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-v2-muted">
                $
              </span>
              <input
                id="add-credit-other"
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                className={cn("v2-input pl-8 text-base font-semibold tabular-nums", amountError && "border-red-400")}
              />
            </div>
          </div>
        ) : null}

        {amountError ? (
          <p className="mt-2 text-xs text-red-700" role="alert">
            {amountError}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
          <p className="inline-flex items-center gap-1.5 text-xs text-v2-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Card details are entered on Stripe&apos;s secure page.
          </p>
          <button type="button" className="v2-btn-primary h-11 shrink-0" disabled={!canContinue} onClick={() => void continueToPayment()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CircleDollarSign className="h-4 w-4" aria-hidden />}
            {amountCents != null && !amountError ? `Add ${formatCredits(amountCents)}` : "Continue"}
          </button>
        </div>
      </div>
    </V2Modal>
  );
}
