import type { BookPackageShippingInput } from "@/lib/bookPackages/types";
import { MIN_TOP_UP_CENTS } from "@/lib/credits/types";
import type { BookBindingId } from "@/lib/print/bookBindings";

/**
 * How today's payment is split. Credit is always used first. When it covers only part, the card
 * pays the rest as a wallet top-up (at least Stripe's minimum), and the package is then bought
 * from credit; with no credit at all the card pays the package directly.
 */
export type PackagePaymentPlan = {
  totalCents: number;
  creditCents: number;
  cardCents: number;
  /** "credit": all from credit. "topup": card tops up the rest, then credit pays. "card": card only. */
  route: "credit" | "topup" | "card";
  balanceAfterCents: number;
};

export function planPackagePayment(totalCents: number, balanceCents: number | null): PackagePaymentPlan {
  const balance = Math.max(0, balanceCents ?? 0);
  if (balance >= totalCents) {
    return { totalCents, creditCents: totalCents, cardCents: 0, route: "credit", balanceAfterCents: balance - totalCents };
  }
  const creditCents = Math.max(0, Math.min(balance, totalCents - MIN_TOP_UP_CENTS));
  const cardCents = totalCents - creditCents;
  return {
    totalCents,
    creditCents,
    cardCents,
    route: creditCents > 0 ? "topup" : "card",
    balanceAfterCents: balance - creditCents,
  };
}

const KEY = "cm_package_topup_purchase";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** The wallet purchase to make once the card top-up lands (kept across the trip to Stripe). */
export type PendingTopUpPurchase = {
  bindingId: BookBindingId;
  expectedPriceCents: number;
  albumName?: string;
  shipping?: BookPackageShippingInput;
};

export function savePendingTopUpPurchase(purchase: PendingTopUpPurchase): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...purchase, at: Date.now() }));
  } catch {
    /* without it the top-up still lands in credit, and the person pays from there */
  }
}

export function readPendingTopUpPurchase(bindingId: BookBindingId): PendingTopUpPurchase | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingTopUpPurchase & { at?: unknown };
    if (parsed.bindingId !== bindingId || typeof parsed.at !== "number" || Date.now() - parsed.at > MAX_AGE_MS) {
      return null;
    }
    if (!Number.isInteger(parsed.expectedPriceCents)) return null;
    return {
      bindingId: parsed.bindingId,
      expectedPriceCents: parsed.expectedPriceCents,
      ...(typeof parsed.albumName === "string" ? { albumName: parsed.albumName } : {}),
      ...(parsed.shipping ? { shipping: parsed.shipping } : {}),
    };
  } catch {
    return null;
  }
}

export function clearPendingTopUpPurchase(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
