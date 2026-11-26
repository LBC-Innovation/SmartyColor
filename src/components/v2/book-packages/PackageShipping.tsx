"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { BookAddressSuggestion, applySuggestion } from "@/components/v2/book-order/BookAddressSuggestion";
import { BookShippingAddressForm } from "@/components/v2/book-order/BookShippingAddressForm";
import { BOOK_PACKAGES } from "@/content/marketing";
import { fetchSavedAddress, isError } from "@/lib/api/client";
import { quotePackageShipping } from "@/lib/bookPackages/client";
import type { BookPackageShippingInput, BookPackageShippingQuote } from "@/lib/bookPackages/types";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";
import {
  EMPTY_SHIPPING_ADDRESS,
  normalizeShippingAddress,
  validateShippingAddress,
} from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";
import type { BookBindingId } from "@/lib/print/bookBindings";

type Mode = "now" | "later";

type QuoteState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; quote: BookPackageShippingQuote }
  | { status: "error"; key: string };

const QUOTE_DELAY_MS = 600;

function addressKey(a: ShippingAddress): string {
  return JSON.stringify(normalizeShippingAddress(a));
}

/**
 * Paying the book's standard shipping with the package (optional). The address is prefilled from
 * the one saved to the account; the price is quoted live once the address is complete, and the
 * server quotes it again when the person pays.
 */
export function usePackageShipping(bindingId: BookBindingId, signedIn: boolean) {
  const [mode, setModeState] = useState<Mode>("later");
  const modeTouchedRef = useRef(false);
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_SHIPPING_ADDRESS);
  const [showErrors, setShowErrors] = useState(false);
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [dismissedSuggestionKey, setDismissedSuggestionKey] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // Prefill from the saved address; a saved address starts on "pay now", since it is ready to quote.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!signedIn || loadedRef.current) return;
    loadedRef.current = true;
    void fetchSavedAddress().then((res) => {
      if (isError(res) || !res.data) return;
      const saved = res.data;
      setAddress((current) => (addressKey(current) === addressKey(EMPTY_SHIPPING_ADDRESS) ? saved : current));
      if (!modeTouchedRef.current) setModeState("now");
    });
  }, [signedIn]);

  const errors = validateShippingAddress(address);
  const complete = Object.keys(errors).length === 0;
  const key = addressKey(address);

  useEffect(() => {
    if (mode !== "now" || !complete) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      setQuote({ status: "loading", key });
      void quotePackageShipping(bindingId, normalizeShippingAddress(address)).then((res) => {
        if (!alive) return;
        setQuote(isError(res) ? { status: "error", key } : { status: "ready", key, quote: res.data });
      });
    }, QUOTE_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // `address` is captured through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, complete, key, bindingId, retryTick]);

  const current = quote.status !== "idle" && quote.key === key ? quote : null;
  const ready = mode === "now" && complete && current?.status === "ready" ? current.quote : null;

  const setMode = useCallback((next: Mode) => {
    modeTouchedRef.current = true;
    setModeState(next);
  }, []);

  /** Quote again (after the server said the price changed, or a failed quote). */
  const requote = useCallback(() => setRetryTick((t) => t + 1), []);

  /** What to send with the purchase; null when the shipping isn't being paid now. */
  const input: BookPackageShippingInput | null = ready
    ? { address: normalizeShippingAddress(address), expectedShippingCents: ready.shippingCents }
    : null;

  return {
    mode,
    setMode,
    address,
    setAddress,
    errors,
    complete,
    showErrors,
    setShowErrors,
    quoteStatus: mode !== "now" ? "off" : !complete ? "incomplete" : (current?.status ?? "loading"),
    quote: ready,
    /** Cents added to today's payment. */
    shippingCents: ready?.shippingCents ?? 0,
    /** "Pay now" is chosen but there is no price to pay yet. */
    blocking: mode === "now" && !ready,
    input,
    requote,
    suggestion:
      ready?.addressSuggestion && dismissedSuggestionKey !== key ? ready.addressSuggestion : null,
    dismissSuggestion: () => setDismissedSuggestionKey(key),
  };
}

export type PackageShippingState = ReturnType<typeof usePackageShipping>;

export function PackageShippingChoice({ state, disabled }: { state: PackageShippingState; disabled: boolean }) {
  const options: { id: Mode; label: string; sub: string }[] = [
    { id: "now", label: BOOK_PACKAGES.shippingNow, sub: BOOK_PACKAGES.shippingNowSub },
    { id: "later", label: BOOK_PACKAGES.shippingLater, sub: BOOK_PACKAGES.shippingLaterSub },
  ];

  return (
    <fieldset className="mt-6">
      <legend className="text-sm font-semibold text-v2-ink">{BOOK_PACKAGES.shippingHeading}</legend>
      <div className="mt-2 space-y-2">
        {options.map((opt) => (
          <label
            key={opt.id}
            className={cn(
              "flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border px-3 py-3",
              state.mode === opt.id ? "border-v2-primary bg-v2-primary-light/40" : "border-gray-200 bg-white",
            )}
          >
            <input
              type="radio"
              name="package-shipping"
              value={opt.id}
              checked={state.mode === opt.id}
              onChange={() => state.setMode(opt.id)}
              disabled={disabled}
              className="mt-1 h-4 w-4 accent-[var(--color-v2-primary,#6d28d9)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-v2-ink">{opt.label}</span>
              <span className="block text-xs text-v2-muted">{opt.sub}</span>
            </span>
          </label>
        ))}
      </div>

      {state.mode === "now" ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <BookShippingAddressForm
            idPrefix="pkg-ship"
            value={state.address}
            onChange={state.setAddress}
            errors={state.showErrors ? state.errors : {}}
          />
          {state.suggestion ? (
            <BookAddressSuggestion
              className="mt-3"
              entered={state.address}
              suggestion={state.suggestion}
              onUse={() => state.setAddress(applySuggestion(state.address, state.suggestion!))}
              onKeep={state.dismissSuggestion}
            />
          ) : null}
          <div className="mt-3 text-sm" role="status" aria-live="polite">
            {state.quoteStatus === "incomplete" ? (
              <p className="text-xs text-v2-muted">{BOOK_PACKAGES.shippingFillAddress}</p>
            ) : state.quoteStatus === "loading" ? (
              <p className="flex items-center gap-2 text-xs text-v2-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {BOOK_PACKAGES.shippingChecking}
              </p>
            ) : state.quoteStatus === "error" ? (
              <p className="text-xs text-amber-900">
                {BOOK_PACKAGES.shippingQuoteFailed}{" "}
                <button type="button" onClick={state.requote} className="v2-hit font-semibold text-v2-link">
                  {BOOK_PACKAGES.shippingRetry}
                </button>
              </p>
            ) : state.quote ? (
              <p className="flex items-baseline justify-between gap-3 text-v2-ink">
                <span>{BOOK_PACKAGES.summaryShipping}</span>
                <span className="font-semibold tabular-nums">{formatCredits(state.quote.shippingCents)}</span>
              </p>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-v2-muted">{BOOK_PACKAGES.shippingSavedNote}</p>
        </div>
      ) : null}
    </fieldset>
  );
}
