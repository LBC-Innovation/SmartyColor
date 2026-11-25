"use client";

import { useState, type ReactNode } from "react";
import { V2AddCreditModal } from "@/components/v2/credits/V2AddCreditModal";
import { useCreditCheckoutReturn } from "@/components/v2/credits/useCreditCheckoutReturn";
import { BOOK_PACKAGES } from "@/content/marketing";
import { useAuth } from "@/context/AuthContext";
import { packageUntouchedNote } from "@/lib/bookPackages/copy";
import {
  INSUFFICIENT_CREDITS_CODE,
  sheetUsageCostCents,
  type SheetUsageKind,
} from "@/lib/credits/pricing";
import { usePriceList } from "@/lib/pricing/usePriceList";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";

type Shortfall = { cents: number; kind: SheetUsageKind };

const SHORTFALL_FOR: Record<SheetUsageKind, string> = {
  generation: "a coloring page",
  edit: "this edit",
  portrait: "a portrait version",
};

/** Same, in an album with a book package: whatever is bought past the package says "extra". */
const PACKAGE_SHORTFALL_FOR: Record<SheetUsageKind, string> = {
  generation: BOOK_PACKAGES.addCreditFor[0],
  edit: BOOK_PACKAGES.addCreditFor[1],
  portrait: BOOK_PACKAGES.addCreditFor[1],
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
export function useSheetUsageCredits(
  returnPath: string,
  opts?: {
    handleCheckoutReturn?: boolean;
    /** The album's purchase code pays for this action, so the wallet isn't checked. */
    covers?: (kind: SheetUsageKind, photo: Pick<V2PhotoEntry, "id" | "editCount">) => boolean;
    /** Called after every successful action, so what the code has left can be read again. */
    onUsage?: () => void;
    /** The open album has a book package: the modal says the package is untouched. */
    packageNote?: { bindingNameLower: string; photosLeft: number; ordered: boolean } | null;
  },
): {
  canAfford: (kind: SheetUsageKind, photo: Pick<V2PhotoEntry, "id" | "remote" | "editCount">) => boolean;
  /** Call with every response; true when it was an out-of-credit refusal (modal is now open). */
  applyResponse: (status: number, payload: UsagePayload, kind: SheetUsageKind) => boolean;
  addCreditModal: ReactNode;
} {
  const { user, setCreditsBalance } = useAuth();
  const prices = usePriceList();
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);

  useCreditCheckoutReturn({ enabled: opts?.handleCheckoutReturn !== false });

  function canAfford(kind: SheetUsageKind, photo: Pick<V2PhotoEntry, "id" | "remote" | "editCount">): boolean {
    if (!photo.remote || !user) return true;
    if (opts?.covers?.(kind, photo)) return true;
    const cost = sheetUsageCostCents(prices, kind, photo.editCount ?? 0);
    // Price not loaded yet: let the server decide; it answers 402 if the wallet is short.
    if (cost == null || user.creditsBalanceCents >= cost) return true;
    setShortfall({ cents: cost - user.creditsBalanceCents, kind });
    return false;
  }

  function applyResponse(status: number, payload: UsagePayload, kind: SheetUsageKind): boolean {
    if (typeof payload.creditsBalanceCents === "number") setCreditsBalance(payload.creditsBalanceCents);
    if (status >= 200 && status < 300) opts?.onUsage?.();
    if (status !== 402 || payload.code !== INSUFFICIENT_CREDITS_CODE) return false;
    setShortfall({ cents: payload.shortfallCents ?? payload.costCents ?? 0, kind });
    return true;
  }

  const pkg = opts?.packageNote ?? null;
  const addCreditModal = shortfall ? (
    <V2AddCreditModal
      onClose={() => setShortfall(null)}
      returnPath={returnPath}
      shortfallCents={shortfall.cents}
      shortfallFor={pkg ? PACKAGE_SHORTFALL_FOR[shortfall.kind] : SHORTFALL_FOR[shortfall.kind]}
      packageNote={pkg ? packageUntouchedNote(pkg) : null}
    />
  ) : null;

  return { canAfford, applyResponse, addCreditModal };
}
