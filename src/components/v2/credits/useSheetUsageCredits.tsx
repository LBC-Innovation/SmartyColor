"use client";

import { useState, type ReactNode } from "react";
import { V2AddCreditModal } from "@/components/v2/credits/V2AddCreditModal";
import { useCreditCheckoutReturn } from "@/components/v2/credits/useCreditCheckoutReturn";
import { useAuth } from "@/context/AuthContext";
import {
  INSUFFICIENT_CREDITS_CODE,
  sheetUsageCostCents,
  type SheetUsageKind,
} from "@/lib/credits/pricing";
import { usePriceList } from "@/lib/pricing/usePriceList";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";

type Shortfall = { cents: number; kind: SheetUsageKind };

const SHORTFALL_FOR: Record<SheetUsageKind, string> = {
  generation: "a coloring sheet",
  edit: "this edit",
  portrait: "a portrait version",
};

/** Fields of a /api/photo-coloring response that concern the wallet. */
type UsagePayload = {
  code?: string;
  costCents?: number;
  shortfallCents?: number;
  creditsBalanceCents?: number;
};

/**
 * Wallet side of the studio's AI actions: blocks an action the balance
 * can't cover by opening the add-credit modal, and keeps the shown balance in
 * step with what the server charged. Guests' local photos are not metered.
 */
export function useSheetUsageCredits(returnPath: string): {
  canAfford: (kind: SheetUsageKind, photo: Pick<V2PhotoEntry, "remote" | "editCount">) => boolean;
  /** Call with every response; true when it was an out-of-credit refusal (modal is now open). */
  applyResponse: (status: number, payload: UsagePayload, kind: SheetUsageKind) => boolean;
  addCreditModal: ReactNode;
} {
  const { user, setCreditsBalance } = useAuth();
  const prices = usePriceList();
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);

  useCreditCheckoutReturn();

  function canAfford(kind: SheetUsageKind, photo: Pick<V2PhotoEntry, "remote" | "editCount">): boolean {
    if (!photo.remote || !user) return true;
    const cost = sheetUsageCostCents(prices, kind, photo.editCount ?? 0);
    // Price not loaded yet: let the server decide; it answers 402 if the wallet is short.
    if (cost == null || user.creditsBalanceCents >= cost) return true;
    setShortfall({ cents: cost - user.creditsBalanceCents, kind });
    return false;
  }

  function applyResponse(status: number, payload: UsagePayload, kind: SheetUsageKind): boolean {
    if (typeof payload.creditsBalanceCents === "number") setCreditsBalance(payload.creditsBalanceCents);
    if (status !== 402 || payload.code !== INSUFFICIENT_CREDITS_CODE) return false;
    setShortfall({ cents: payload.shortfallCents ?? payload.costCents ?? 0, kind });
    return true;
  }

  const addCreditModal = shortfall ? (
    <V2AddCreditModal
      onClose={() => setShortfall(null)}
      returnPath={returnPath}
      shortfallCents={shortfall.cents}
      shortfallFor={SHORTFALL_FOR[shortfall.kind]}
    />
  ) : null;

  return { canAfford, applyResponse, addCreditModal };
}
