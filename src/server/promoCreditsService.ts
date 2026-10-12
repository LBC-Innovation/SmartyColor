import type { ApiResult } from "@/lib/api/types";
import { MAX_WELCOME_CREDIT_CENTS, type PromoCreditSettings } from "@/lib/credits/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

const COLUMNS = "welcome_credit_cents, updated_at";

function toSettings(row: { welcome_credit_cents: number; updated_at: string }): PromoCreditSettings {
  return { welcomeCreditCents: row.welcome_credit_cents, updatedAt: row.updated_at };
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

export async function updatePromoCreditSettings(input: {
  welcomeCreditCents: number;
  adminId: string;
}): Promise<ApiResult<PromoCreditSettings>> {
  const cents = input.welcomeCreditCents;
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_WELCOME_CREDIT_CENTS) {
    return {
      data: null,
      error: { message: `Welcome credit must be between $0 and $${MAX_WELCOME_CREDIT_CENTS / 100}` },
    };
  }

  const { data, error } = await getSupabaseAdmin()
    .from("promo_settings")
    .update({ welcome_credit_cents: cents, updated_by: input.adminId })
    .eq("id", true)
    .select(COLUMNS)
    .single();
  if (error || !data) {
    return { data: null, error: { message: error?.message ?? "Promo settings not found" } };
  }

  log("info", "Admin updated welcome credit", { adminId: input.adminId, welcomeCreditCents: cents });
  return { data: toSettings(data), error: null };
}
