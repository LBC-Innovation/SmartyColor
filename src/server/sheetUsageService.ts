import "server-only";
import type { ApiResult } from "@/lib/api/types";
import { INSUFFICIENT_CREDITS_CODE, sheetUsageCostCents, type SheetUsageKind } from "@/lib/credits/pricing";
import type { PriceSku } from "@/lib/pricing/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { chargeableCents, getPublicPriceList } from "@/server/pricingService";

export type SheetUsageCharge = {
  chargedCents: number;
  creditsBalanceCents: number;
  editCount: number;
};

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

function insufficientMessage(kind: SheetUsageKind | "other"): string {
  if (kind === "edit") return "You've used this sheet's free edits. Add credit to keep editing.";
  if (kind === "portrait") return "Add credit to make a portrait version of this photo.";
  if (kind === "generation") return "Add credit to generate this coloring sheet.";
  return "Add credit to use this feature.";
}

/** JSON body for the 402 the studio turns into the add-credit modal. */
export function insufficientCreditsBody(kind: SheetUsageKind | "other", costCents: number, balanceCents: number) {
  return {
    error: insufficientMessage(kind),
    code: INSUFFICIENT_CREDITS_CODE,
    costCents,
    creditsBalanceCents: balanceCents,
    shortfallCents: Math.max(costCents - balanceCents, 0),
  };
}

async function walletBalance(userId: string): Promise<ApiResult<number>> {
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!data) return { data: null, error: { message: "User profile not found" } };
  return { data: data.credits_balance as number, error: null };
}

type UsageQuote = { costCents: number; creditsBalanceCents: number; affordable: boolean };

/** Cheap check before spending on the model; the charge itself re-checks atomically. */
export async function quoteSheetUsage(
  userId: string,
  kind: SheetUsageKind,
  editCount: number,
): Promise<ApiResult<UsageQuote>> {
  const [prices, balance] = await Promise.all([getPublicPriceList(), walletBalance(userId)]);
  if (prices.error) return prices;
  if (balance.error) return balance;
  const costCents = sheetUsageCostCents(prices.data, kind, editCount);
  if (costCents == null) return { data: null, error: { message: `No price is set for ${kind}` } };
  return {
    data: { costCents, creditsBalanceCents: balance.data, affordable: balance.data >= costCents },
    error: null,
  };
}

/** The same check for an action priced per use that isn't tied to a photo. */
export async function quoteWalletUsage(userId: string, sku: PriceSku): Promise<ApiResult<UsageQuote>> {
  const [price, balance] = await Promise.all([chargeableCents(sku), walletBalance(userId)]);
  if (price.error) return price;
  if (balance.error) return balance;
  return {
    data: { costCents: price.data, creditsBalanceCents: balance.data, affordable: balance.data >= price.data },
    error: null,
  };
}

/** Charges at the catalog price, read in the same transaction as the charge. */
export async function chargeSheetUsage(
  userId: string,
  photoId: string,
  kind: SheetUsageKind,
): Promise<ApiResult<SheetUsageCharge>> {
  const { data, error } = await getSupabaseAdmin().rpc("charge_photo_usage", {
    p_user_id: userId,
    p_photo_id: photoId,
    p_kind: kind,
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

export async function chargeWalletUsage(
  userId: string,
  sku: PriceSku,
  reference?: { type: string; id: string },
): Promise<ApiResult<{ chargedCents: number; creditsBalanceCents: number }>> {
  const { data, error } = await getSupabaseAdmin().rpc("charge_wallet_usage", {
    p_user_id: userId,
    p_sku: sku,
    p_reference_type: reference?.type ?? null,
    p_reference_id: reference?.id ?? null,
  });
  if (error) {
    if (error.message.includes("insufficient credits")) {
      return { data: null, error: { message: insufficientMessage("other"), code: INSUFFICIENT_CREDITS_CODE } };
    }
    return { data: null, error: { message: error.message } };
  }
  const charge = data as { chargedCents: number; creditsBalanceCents: number };
  if (charge.chargedCents > 0) log("info", "Wallet usage charged", { userId, sku, ...charge });
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
