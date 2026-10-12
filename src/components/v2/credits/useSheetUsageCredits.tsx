"use client";

import { useEffect, useState, type ReactNode } from "react";
import { V2AddCreditModal } from "@/components/v2/credits/V2AddCreditModal";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useAuth } from "@/context/AuthContext";
import {
  INSUFFICIENT_CREDITS_CODE,
  sheetUsageCostCents,
  type SheetUsageKind,
} from "@/lib/credits/pricing";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";

type Shortfall = { cents: number; kind: SheetUsageKind };

/** Fields of a /api/photo-coloring response that concern the wallet. */
type UsagePayload = {
  code?: string;
  costCents?: number;
  shortfallCents?: number;
  creditsBalanceCents?: number;
};

/**
 * Wallet side of generating and editing sheets: blocks an action the balance
 * can't cover by opening the add-credit modal, and keeps the shown balance in
 * step with what the server charged. Guests' local photos are not metered.
 */
export function useSheetUsageCredits(returnPath: string): {
  canAfford: (kind: SheetUsageKind, photo: Pick<V2PhotoEntry, "remote" | "editCount">) => boolean;
  /** Call with every response; true when it was an out-of-credit refusal (modal is now open). */
  applyResponse: (status: number, payload: UsagePayload, kind: SheetUsageKind) => boolean;
  addCreditModal: ReactNode;
} {
  const toast = useV2Toast();
  const { user, refreshUser, setCreditsBalance } = useAuth();
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);

  // Back from Stripe Checkout.
  useEffect(() => {
    const url = new URL(window.location.href);
    const creditsReturn = url.searchParams.get("credits");
    if (!creditsReturn) return;
    if (creditsReturn === "success") {
      void refreshUser();
      toast.success({ title: "Credit added", message: "Your balance is updated." });
    } else if (creditsReturn === "canceled") {
      toast.info("No charge was made.", "Payment canceled");
    }
    // Clean the flag so a refresh doesn't repeat the toast.
    url.searchParams.delete("credits");
    window.history.replaceState(null, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function canAfford(kind: SheetUsageKind, photo: Pick<V2PhotoEntry, "remote" | "editCount">): boolean {
    if (!photo.remote || !user) return true;
    const cost = sheetUsageCostCents(kind, photo.editCount ?? 0);
    if (user.creditsBalanceCents >= cost) return true;
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
      shortfallFor={shortfall.kind === "edit" ? "this edit" : "a coloring sheet"}
    />
  ) : null;

  return { canAfford, applyResponse, addCreditModal };
}
