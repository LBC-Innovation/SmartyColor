import type { ApiResult } from "@/lib/api/types";
import { MAX_WELCOME_CREDIT_CENTS, MAX_WELCOME_FREE_SHEETS, type PromoCreditSettings } from "@/lib/credits/types";
import { chargeableCents } from "@/server/pricingService";
import { getSupabaseAdmin } from "@/lib/supabase/service";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

const COLUMNS = "welcome_free_sheets, referral_friend_credit_cents, referral_sharer_credit_cents, updated_at";

type SettingsRow = {
  welcome_free_sheets: number;
  referral_friend_credit_cents: number;
  referral_sharer_credit_cents: number;
  updated_at: string;
};

/** What one new sheet costs today, read the way the database charges it; null if unpriced. */
async function sheetPrice(): Promise<number | null> {
  const price = await chargeableCents("ai.sheet_generation");
  if (price.error) {
    log("warn", "Sheet price unavailable", { error: price.error.message });
    return null;
  }
  return price.data;
}

function toSettings(row: SettingsRow, sheetPriceCents: number | null): PromoCreditSettings {
  return {
    welcomeFreeSheets: row.welcome_free_sheets,
    sheetPriceCents,
    welcomeCreditCents: row.welcome_free_sheets * (sheetPriceCents ?? 0),
    friendCreditCents: row.referral_friend_credit_cents,
    sharerCreditCents: row.referral_sharer_credit_cents,
    updatedAt: row.updated_at,
  };
}

export async function getPromoCreditSettings(): Promise<ApiResult<PromoCreditSettings>> {
  const [{ data, error }, priceCents] = await Promise.all([
    getSupabaseAdmin().from("promo_settings").select(COLUMNS).eq("id", true).single(),
    sheetPrice(),
  ]);
  if (error || !data) {
    return { data: null, error: { message: error?.message ?? "Promo settings not found" } };
  }
  return { data: toSettings(data, priceCents), error: null };
}

function validCents(cents: number | undefined): boolean {
  return cents === undefined || (Number.isInteger(cents) && cents >= 0 && cents <= MAX_WELCOME_CREDIT_CENTS);
}

function validSheets(sheets: number | undefined): boolean {
  return sheets === undefined || (Number.isInteger(sheets) && sheets >= 0 && sheets <= MAX_WELCOME_FREE_SHEETS);
}

export async function updatePromoCreditSettings(input: {
  welcomeFreeSheets?: number;
  friendCreditCents?: number;
  sharerCreditCents?: number;
  adminId: string;
}): Promise<ApiResult<PromoCreditSettings>> {
  const { welcomeFreeSheets, friendCreditCents, sharerCreditCents } = input;
  if (!validSheets(welcomeFreeSheets)) {
    return {
      data: null,
      error: { message: `Free sheets must be a whole number from 0 to ${MAX_WELCOME_FREE_SHEETS}` },
    };
  }
  if (!validCents(friendCreditCents) || !validCents(sharerCreditCents)) {
    return {
      data: null,
      error: { message: `Promo credits must be between $0 and $${MAX_WELCOME_CREDIT_CENTS / 100}` },
    };
  }
  if (welcomeFreeSheets === undefined && friendCreditCents === undefined && sharerCreditCents === undefined) {
    return { data: null, error: { message: "Nothing to change" } };
  }

  const { data, error } = await getSupabaseAdmin()
    .from("promo_settings")
    .update({
      ...(welcomeFreeSheets !== undefined ? { welcome_free_sheets: welcomeFreeSheets } : {}),
      ...(friendCreditCents !== undefined ? { referral_friend_credit_cents: friendCreditCents } : {}),
      ...(sharerCreditCents !== undefined ? { referral_sharer_credit_cents: sharerCreditCents } : {}),
      updated_by: input.adminId,
    })
    .eq("id", true)
    .select(COLUMNS)
    .single();
  if (error || !data) {
    return { data: null, error: { message: error?.message ?? "Promo settings not found" } };
  }

  log("info", "Admin updated promo credits", {
    adminId: input.adminId,
    welcomeFreeSheets,
    friendCreditCents,
    sharerCreditCents,
  });
  return { data: toSettings(data, await sheetPrice()), error: null };
}
