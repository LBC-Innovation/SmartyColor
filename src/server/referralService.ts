import "server-only";
import { randomInt } from "node:crypto";
import type { ApiResult } from "@/lib/api/types";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import type { FriendInvite, ReferralSummary } from "@/lib/credits/types";
import { friendPath, type FriendLinkVia } from "@/lib/marketing/friendLink";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/**
 * Share with a friend. Each account has a short code, assigned the first time it asks for its
 * link. The link is a short `/friend/CODE?v=<how it was sent>` (short so the QR code stays easy to
 * scan); the landing page adds ?ref=CODE and utm_campaign=share_with_a_friend before recording the
 * visit, the cm_attr cookie keeps those through sign-up onto profiles.attribution, and the database
 * credits both accounts once the friend's email is confirmed (grant_friend_signup_credit,
 * migration 0040). Nothing here grants credit.
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

export function referralUrl(code: string, via: FriendLinkVia = "link"): string {
  return `${clientOrigin()}${friendPath(code, via)}`;
}

async function displayNameOf(userId: string, fallbackEmail?: string): Promise<string> {
  const { data } = await db().from("profiles").select("display_name").eq("id", userId).maybeSingle();
  const name = (data?.display_name as string | null)?.trim();
  if (name) return name;
  return fallbackEmail?.split("@")[0] || "A friend";
}

async function friendAmounts(): Promise<ApiResult<{ friend: number; sharer: number }>> {
  const { data, error } = await db()
    .from("promo_settings")
    .select("referral_friend_credit_cents, referral_sharer_credit_cents")
    .eq("id", true)
    .maybeSingle();
  if (error) return err(error.message);
  return {
    data: {
      friend: (data?.referral_friend_credit_cents as number | undefined) ?? 0,
      sharer: (data?.referral_sharer_credit_cents as number | undefined) ?? 0,
    },
    error: null,
  };
}

/** The friend landing page's details for a code; NOT_FOUND for a code nobody has. */
export async function getFriendInvite(rawCode: string): Promise<ApiResult<FriendInvite>> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return err("Unknown link", "NOT_FOUND");
  const { data, error } = await db().from("profiles").select("id, display_name").eq("referral_code", code).maybeSingle();
  if (error) return err(error.message);
  if (!data) return err("Unknown link", "NOT_FOUND");
  const amounts = await friendAmounts();
  if (amounts.error) return amounts;
  const name = (data.display_name as string | null)?.trim();
  return {
    data: { code, sharerName: name || "A friend", friendCreditCents: amounts.data!.friend },
    error: null,
  };
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

/**
 * The account's referral code (assigned now if it has none), for tagging links the account sends
 * out: shared pages, album invites, family emails. Null when it can't be read; links then go
 * out untagged rather than failing.
 */
export async function referralCodeFor(userId: string): Promise<string | null> {
  try {
    const code = await ensureCode(userId);
    return code.data ?? null;
  } catch {
    return null;
  }
}

/** `url` with the sharer's referral code and campaign tags added (existing tags are kept). */
export function withShareTags(url: string, tags: Record<string, string | null | undefined>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(tags)) if (v && !u.searchParams.has(k)) u.searchParams.set(k, v);
  return u.toString();
}

export async function getReferralSummary(user: { id: string; email: string }): Promise<ApiResult<ReferralSummary>> {
  const code = await ensureCode(user.id);
  if (code.error) return code;

  const [amounts, credits, sharerName] = await Promise.all([
    friendAmounts(),
    db().from("referral_credits").select("amount_cents").eq("referrer_id", user.id),
    displayNameOf(user.id, user.email),
  ]);
  if (amounts.error) return amounts;
  if (credits.error) return err(credits.error.message);

  const rows = credits.data ?? [];
  return {
    data: {
      code: code.data!,
      url: referralUrl(code.data!),
      qrUrl: referralUrl(code.data!, "qr"),
      sharerName,
      friendCreditCents: amounts.data!.friend,
      sharerCreditCents: amounts.data!.sharer,
      referredCount: rows.length,
      earnedCents: rows.reduce((sum, r) => sum + ((r.amount_cents as number) ?? 0), 0),
    },
    error: null,
  };
}
