import "server-only";
import type { ApiResult } from "@/lib/api/types";
import {
  FREE_EDITS_PER_SHEET,
  INSUFFICIENT_CREDITS_CODE,
  sheetUsageCostCents,
  sheetUsagePriceCents,
  type SheetUsageKind,
} from "@/lib/credits/pricing";
import { getSupabaseAdmin } from "@/lib/supabase/service";

export type SheetUsageCharge = {
  chargedCents: number;
  creditsBalanceCents: number;
  editCount: number;
};

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

function insufficientMessage(kind: SheetUsageKind): string {
  if (kind === "edit") return "You've used this sheet's free edits. Add credit to keep editing.";
  if (kind === "portrait") return "Add credit to make a portrait version of this photo.";
  return "Add credit to generate this coloring sheet.";
}

/** JSON body for the 402 the studio turns into the add-credit modal. */
export function insufficientCreditsBody(kind: SheetUsageKind, costCents: number, balanceCents: number) {
  return {
    error: insufficientMessage(kind),
    code: INSUFFICIENT_CREDITS_CODE,
    costCents,
    creditsBalanceCents: balanceCents,
    shortfallCents: Math.max(costCents - balanceCents, 0),
  };
}

/** Cheap check before spending on the model; the charge itself re-checks atomically. */
export async function quoteSheetUsage(
  userId: string,
  kind: SheetUsageKind,
  editCount: number,
): Promise<ApiResult<{ costCents: number; creditsBalanceCents: number; affordable: boolean }>> {
  const costCents = sheetUsageCostCents(kind, editCount);
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!data) return { data: null, error: { message: "User profile not found" } };
  const creditsBalanceCents = data.credits_balance as number;
  return {
    data: { costCents, creditsBalanceCents, affordable: creditsBalanceCents >= costCents },
    error: null,
  };
}

export async function chargeSheetUsage(
  userId: string,
  photoId: string,
  kind: SheetUsageKind,
): Promise<ApiResult<SheetUsageCharge>> {
  const { data, error } = await getSupabaseAdmin().rpc("charge_sheet_usage", {
    p_user_id: userId,
    p_photo_id: photoId,
    p_kind: kind,
    p_price_cents: sheetUsagePriceCents(kind),
    p_free_edits: FREE_EDITS_PER_SHEET,
  });
  if (error) {
    if (error.message.includes("insufficient credits")) {
      return { data: null, error: { message: insufficientMessage(kind), code: INSUFFICIENT_CREDITS_CODE } };
    }
    return { data: null, error: { message: error.message } };
  }
  const charge = data as SheetUsageCharge;
  log("info", "Sheet usage charged", { userId, photoId, kind, ...charge });
  return { data: charge, error: null };
}

/** Best effort: the sheet could not be saved after the charge, so give it back. */
export async function refundSheetUsage(
  userId: string,
  photoId: string,
  kind: SheetUsageKind,
  chargedCents: number,
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("refund_sheet_usage", {
    p_user_id: userId,
    p_photo_id: photoId,
    p_kind: kind,
    p_charged_cents: chargedCents,
  });
  if (error) {
    log("error", "Sheet usage refund failed", { userId, photoId, kind, chargedCents, error: error.message });
    return;
  }
  log("info", "Sheet usage refunded", { userId, photoId, kind, chargedCents });
}
