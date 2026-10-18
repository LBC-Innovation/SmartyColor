import "server-only";
import { randomInt } from "node:crypto";
import type { ApiResult } from "@/lib/api/types";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import type { ReferralSummary } from "@/lib/credits/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/**
 * Refer-a-friend. Each account has a short code, assigned the first time it asks for its link.
 * The link lands on `/?ref=CODE`; the cm_attr cookie keeps the code through sign-up and onto
 * the order, and the database credits both accounts once when the friend's first order is
 * paid (grant_referral_credit, migration 0025). Nothing here grants credit.
 */

const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });

/** No 0/O or 1/I/L, so a code read aloud or retyped still works. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const UNIQUE_VIOLATION = "23505";

function db() {
  return getSupabaseAdmin();
}

function newCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function referralUrl(code: string): string {
  return `${clientOrigin()}/?ref=${encodeURIComponent(code)}&utm_source=referral&utm_medium=friend_link`;
}

async function ensureCode(userId: string): Promise<ApiResult<string>> {
  const { data, error } = await db().from("profiles").select("referral_code").eq("id", userId).maybeSingle();
  if (error) return err(error.message);
  if (!data) return err("Profile not found", "NOT_FOUND");
  if (data.referral_code) return { data: data.referral_code as string, error: null };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { data: updated, error: updateError } = await db()
      .from("profiles")
      .update({ referral_code: code })
      .eq("id", userId)
      .is("referral_code", null)
      .select("referral_code")
      .maybeSingle();
    if (updateError?.code === UNIQUE_VIOLATION) continue;
    if (updateError) return err(updateError.message);
    if (updated) return { data: updated.referral_code as string, error: null };
    // Another request assigned one first.
    return ensureCode(userId);
  }
  return err("Could not create a referral code");
}

export async function getReferralSummary(userId: string): Promise<ApiResult<ReferralSummary>> {
  const code = await ensureCode(userId);
  if (code.error) return code;

  const [settings, credits] = await Promise.all([
    db().from("promo_settings").select("referral_credit_cents").eq("id", true).maybeSingle(),
    db().from("referral_credits").select("amount_cents").eq("referrer_id", userId),
  ]);
  if (settings.error) return err(settings.error.message);
  if (credits.error) return err(credits.error.message);

  const rows = credits.data ?? [];
  return {
    data: {
      code: code.data!,
      url: referralUrl(code.data!),
      creditCents: (settings.data?.referral_credit_cents as number | undefined) ?? 0,
      referredCount: rows.length,
      earnedCents: rows.reduce((sum, r) => sum + ((r.amount_cents as number) ?? 0), 0),
    },
    error: null,
  };
}
