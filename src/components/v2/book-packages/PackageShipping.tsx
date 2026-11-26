"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Truck } from "lucide-react";
import { BookAddressSuggestion, applySuggestion } from "@/components/v2/book-order/BookAddressSuggestion";
import { BookShippingAddressForm } from "@/components/v2/book-order/BookShippingAddressForm";
import { BOOK_PACKAGES } from "@/content/marketing";
import { fetchSavedAddress, isError } from "@/lib/api/client";
import { fillPackageCopy } from "@/lib/bookPackages/copy";
import { quotePackageShipping } from "@/lib/bookPackages/client";
import type { BookPackageShippingInput, BookPackageShippingQuote } from "@/lib/bookPackages/types";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";
import { formatDeliveryRange } from "@/lib/orders/deliveryEstimate";
import {
  EMPTY_SHIPPING_ADDRESS,
  normalizeShippingAddress,
  validateShippingAddress,
} from "@/lib/orders/shippingAddress";
import {
  DEFAULT_SHIPPING_LEVEL,
  isShippingLevel,
  shippingLevelLabel,
  type ShippingChoice,
  type ShippingLevel,
} from "@/lib/orders/shippingLevels";
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
 * Paying the book's shipping with the package (optional), at the speed the person picks. The
 * address is prefilled from the one saved to the account; the price is quoted live once the
 * address is complete, and the server quotes it again when the person pays.
 */
export function usePackageShipping(bindingId: BookBindingId, signedIn: boolean) {
  const [mode, setModeState] = useState<Mode>("later");
  const modeTouchedRef = useRef(false);
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_SHIPPING_ADDRESS);
  const [showErrors, setShowErrors] = useState(false);
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [dismissedSuggestionKey, setDismissedSuggestionKey] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [level, setLevel] = useState<ShippingLevel>(DEFAULT_SHIPPING_LEVEL);
  // The speeds offered to the last quoted address, kept while a new price loads.
  const [choices, setChoices] = useState<ShippingChoice[]>([]);
  // Set when a quote came back for another speed than asked: that price is already in hand.
  const alreadyQuotedKeyRef = useRef<string | null>(null);

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
  const addrKey = addressKey(address);
  const key = `${addrKey}|${level}`;

  useEffect(() => {
    if (mode !== "now" || !complete) return;
    if (alreadyQuotedKeyRef.current === key) {
      alreadyQuotedKeyRef.current = null;
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setQuote({ status: "loading", key });
      void quotePackageShipping(bindingId, normalizeShippingAddress(address), level).then((res) => {
        if (!alive) return;
        if (isError(res)) {
          setQuote({ status: "error", key });
          return;
        }
        setChoices(res.data.choices);
        // The printer priced another speed (the one asked for isn't offered here): follow it.
        if (res.data.shippingLevel !== level) {
          const followedKey = `${addrKey}|${res.data.shippingLevel}`;
          alreadyQuotedKeyRef.current = followedKey;
          setLevel(res.data.shippingLevel);
          setQuote({ status: "ready", key: followedKey, quote: res.data });
          return;
        }
        setQuote({ status: "ready", key, quote: res.data });
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
    ? {
        address: normalizeShippingAddress(address),
        shippingLevel: ready.shippingLevel,
        expectedShippingCents: ready.shippingCents,
      }
    : null;

  return {
    mode,
    setMode,
    level,
    setLevel: useCallback((next: string) => {
      if (isShippingLevel(next)) setLevel(next);
    }, []),
    /** Speeds to pick from; the chosen one is always listed, even before a quote. */
    choices,
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
      ready?.addressSuggestion && dismissedSuggestionKey !== addrKey ? ready.addressSuggestion : null,
    dismissSuggestion: () => setDismissedSuggestionKey(addrKey),
  };
}

export type PackageShippingState = ReturnType<typeof usePackageShipping>;

export function PackageShippingChoice({ state, disabled }: { state: PackageShippingState; disabled: boolean }) {
  const payNow = state.mode === "now";
  const descId = "package-shipping-desc";

  return (
    <div className="mt-6">
      <p className="text-sm font-semibold text-v2-ink">{BOOK_PACKAGES.shippingHeading}</p>
      <div
        className={cn(
          "mt-2 rounded-xl border px-3.5 py-2.5",
          payNow ? "border-v2-primary bg-v2-primary-light/40" : "border-gray-200 bg-white",
        )}
      >
        <button
          type="button"
          role="switch"
          aria-checked={payNow}
          aria-describedby={descId}
          onClick={() => state.setMode(payNow ? "later" : "now")}
          disabled={disabled}
          className="v2-hit-y flex w-full items-center justify-between gap-3 rounded-lg text-left outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="text-sm font-semibold text-v2-ink">{BOOK_PACKAGES.shippingNow}</span>
          <span
            aria-hidden
            className={cn(
              "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors",
              payNow ? "border-v2-primary bg-v2-primary" : "border-gray-300 bg-gray-200",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform",
                payNow ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
        <p id={descId} className="mt-0.5 pr-12 text-xs leading-snug text-v2-muted" aria-live="polite">
          {payNow ? BOOK_PACKAGES.shippingNowSub : BOOK_PACKAGES.shippingLaterSub}
        </p>
      </div>

      {payNow ? (
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

          <div className="mt-4 border-t border-gray-100 pt-4">
            {state.quoteStatus === "incomplete" ? (
              <p className="text-xs text-v2-muted">{BOOK_PACKAGES.shippingFillAddress}</p>
            ) : state.quoteStatus === "error" ? (
              <p className="text-xs text-amber-900" role="status">
                {BOOK_PACKAGES.shippingQuoteFailed}{" "}
                <button type="button" onClick={state.requote} className="v2-hit font-semibold text-v2-link">
                  {BOOK_PACKAGES.shippingRetry}
                </button>
              </p>
            ) : state.choices.length === 0 ? (
              <p className="flex items-center gap-2 text-xs text-v2-muted" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {BOOK_PACKAGES.shippingChecking}
              </p>
            ) : (
              <ShippingSpeedPicker state={state} disabled={disabled} />
            )}
          </div>
          <p className="mt-3 text-xs text-v2-muted">{BOOK_PACKAGES.shippingSavedNote}</p>
        </div>
      ) : null}
    </div>
  );
}

/** "Dec 3 – Dec 9" as "Arrives Dec 3 – Dec 9", or "" when the printer gave no dates. */
function arrivesText(choice: ShippingChoice): string {
  const range = formatDeliveryRange({ min: choice.deliveryMin, max: choice.deliveryMax });
  return range ? (fillPackageCopy(BOOK_PACKAGES.shippingSpeedArrives, { range }) ?? "") : "";
}

/** Against the chosen speed, as the book order's speed picker shows it: "+$4.20", "−$1.10". */
function priceDifference(choice: ShippingChoice, current: ShippingChoice | null): string {
  if (!current || choice.costCents == null || current.costCents == null) return "";
  const diff = choice.costCents - current.costCents;
  if (diff === 0) return BOOK_PACKAGES.shippingSpeedSamePrice;
  return diff > 0 ? `+${formatCredits(diff)}` : `−${formatCredits(-diff)}`;
}

/**
 * The speed the shipping is paid at, and its price. Opens a list of every speed the printer
 * offers to the address, each with its delivery dates and what it adds.
 */
function ShippingSpeedPicker({ state, disabled }: { state: PackageShippingState; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const labelId = useId();
  const listId = useId();

  const current = state.choices.find((c) => c.level === state.level) ?? null;
  const loading = state.quoteStatus === "loading";
  const priceCents = state.quote?.shippingCents ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    // Start on the chosen speed, so arrow keys move from there.
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"] button')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function moveFocus(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1);
    items[next]?.focus();
  }

  function choose(level: ShippingLevel) {
    state.setLevel(level);
    setOpen(false);
    triggerRef.current?.focus();
  }

  const triggerLabel = current?.label ?? shippingLevelLabel(state.level);
  const triggerArrives = current ? arrivesText(current) : "";

  return (
    <div ref={rootRef} className="relative">
      <p id={labelId} className="v2-label">
        {BOOK_PACKAGES.shippingSpeedLabel}
      </p>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelId}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left transition hover:border-v2-primary/40 disabled:cursor-not-allowed disabled:opacity-60",
          open ? "border-v2-primary/55 shadow-[0_0_0_3px_rgb(116_70_240/0.12)]" : "border-gray-200",
        )}
      >
        <Truck className="h-5 w-5 shrink-0 text-v2-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-v2-ink">
            {triggerLabel}
            {current?.service ? <span className="font-normal text-v2-muted"> · {current.service}</span> : null}
          </span>
          {triggerArrives ? <span className="block text-xs text-v2-muted">{triggerArrives}</span> : null}
        </span>
        <span className="shrink-0 text-right" aria-live="polite">
          {loading || priceCents == null ? (
            <Loader2 className="ml-auto h-4 w-4 animate-spin text-v2-muted" aria-label={BOOK_PACKAGES.shippingChecking} />
          ) : (
            <>
              <span className="block text-sm font-semibold tabular-nums text-v2-ink">{formatCredits(priceCents)}</span>
              <span className="block text-[11px] leading-tight text-v2-muted">{BOOK_PACKAGES.shippingWithTax}</span>
            </>
          )}
        </span>
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-v2-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          onKeyDown={moveFocus}
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-v2-surface p-1 shadow-[0_12px_32px_rgb(10_16_26/0.14)]"
        >
          {state.choices.map((choice) => {
            const selected = choice.level === state.level;
            const arrives = arrivesText(choice);
            const difference = selected ? "" : priceDifference(choice, current);
            return (
              <li key={choice.level} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => choose(choice.level)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-v2-primary",
                    selected ? "bg-v2-primary-light/70" : "hover:bg-v2-bg-subtle",
                  )}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
                    {selected ? <Check className="h-4 w-4 text-v2-primary" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-semibold", selected ? "text-v2-link" : "text-v2-ink")}>
                      {choice.label}
                      {choice.service ? <span className="font-normal text-v2-muted"> · {choice.service}</span> : null}
                    </span>
                    {arrives ? <span className="block text-xs text-v2-muted">{arrives}</span> : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm tabular-nums",
                      selected ? "font-semibold text-v2-link" : "font-medium text-v2-ink",
                    )}
                  >
                    {selected ? BOOK_PACKAGES.shippingSpeedSelected : difference}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
