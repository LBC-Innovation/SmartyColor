import type { ApiResult } from "@/lib/api/types";
import { MAX_WELCOME_CREDIT_CENTS, type PromoCreditSettings } from "@/lib/credits/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

const COLUMNS = "welcome_credit_cents, referral_credit_cents, updated_at";

type SettingsRow = { welcome_credit_cents: number; referral_credit_cents: number; updated_at: string };

function toSettings(row: SettingsRow): PromoCreditSettings {
  return {
    welcomeCreditCents: row.welcome_credit_cents,
    referralCreditCents: row.referral_credit_cents,
    updatedAt: row.updated_at,
  };
}

export async function getPromoCreditSettings(): Promise<ApiResult<PromoCreditSettings>> {
  const { data, error } = await getSupabaseAdmin()
    .from("promo_settings")
    .select(COLUMNS)
    .eq("id", true)
    .single();
  if (error || !data) {
    return { data: null, error: { message: error?.message ?? "Promo settings not found" } };
  }
  return { data: toSettings(data), error: null };
}

function validCents(cents: number | undefined): boolean {
  return cents === undefined || (Number.isInteger(cents) && cents >= 0 && cents <= MAX_WELCOME_CREDIT_CENTS);
}

export async function updatePromoCreditSettings(input: {
  welcomeCreditCents?: number;
  referralCreditCents?: number;
  adminId: string;
}): Promise<ApiResult<PromoCreditSettings>> {
  const { welcomeCreditCents, referralCreditCents } = input;
  if (!validCents(welcomeCreditCents) || !validCents(referralCreditCents)) {
    return {
      data: null,
      error: { message: `Promo credits must be between $0 and $${MAX_WELCOME_CREDIT_CENTS / 100}` },
    };
  }
  if (welcomeCreditCents === undefined && referralCreditCents === undefined) {
    return { data: null, error: { message: "Nothing to change" } };
  }

  const { data, error } = await getSupabaseAdmin()
    .from("promo_settings")
    .update({
      ...(welcomeCreditCents !== undefined ? { welcome_credit_cents: welcomeCreditCents } : {}),
      ...(referralCreditCents !== undefined ? { referral_credit_cents: referralCreditCents } : {}),
      updated_by: input.adminId,
    })
    .eq("id", true)
    .select(COLUMNS)
    .single();
  if (error || !data) {
    return { data: null, error: { message: error?.message ?? "Promo settings not found" } };
  }

  log("info", "Admin updated promo credits", { adminId: input.adminId, welcomeCreditCents, referralCreditCents });
  return { data: toSettings(data), error: null };
}
