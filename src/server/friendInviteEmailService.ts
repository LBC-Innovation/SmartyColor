import "server-only";
import type { ApiResult } from "@/lib/api/types";
import type { AuthUser } from "@/lib/auth/authenticate";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { recordActivity } from "@/server/activityService";
import { friendInviteEmail } from "@/server/email/friendInviteEmail";
import { emailConfigured, sendEmail } from "@/server/email/resend";
import { normalizeEmail } from "@/server/libraryAccess";
import { getReferralSummary, referralUrl } from "@/server/referralService";

const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Emails to other people are the spam risk here, so they are capped per account per day. */
const MAX_FRIEND_EMAILS_PER_DAY = 20;
const MAX_NOTE_LENGTH = 500;

async function friendEmailsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await getSupabaseAdmin()
    .from("account_activity")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "friend_invited")
    .gte("occurred_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Email the account's Share with a friend link to someone. */
export async function emailFriendInvite(input: {
  user: AuthUser;
  email: string;
  note: string;
}): Promise<ApiResult<{ sent: true }>> {
  const { user } = input;
  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return err("Enter a valid email address.", "INVALID_EMAIL");
  if (email === normalizeEmail(user.email)) return err("Send it to a friend's address, not your own.", "INVALID_EMAIL");
  const note = input.note.trim().slice(0, MAX_NOTE_LENGTH);
  if (process.env.NODE_ENV === "production" && !emailConfigured()) {
    return err("Email isn't available right now. Please try again later.", "UNAVAILABLE");
  }

  try {
    if ((await friendEmailsToday(user.id)) >= MAX_FRIEND_EMAILS_PER_DAY) {
      return err("You've invited a lot of friends today. Please try again tomorrow.", "LIMIT");
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not check today's emails");
  }

  const summary = await getReferralSummary(user);
  if (summary.error) return summary;
  const { code, sharerName, friendCreditCents } = summary.data!;

  const sent = await sendEmail(
    friendInviteEmail({ to: email, senderName: sharerName, note, url: referralUrl(code, "email"), friendCreditCents }),
  );
  if (!sent) return err("The email couldn't be sent. Please try again.", "SEND_FAILED");

  await recordActivity({
    userId: user.id,
    category: "wallet",
    type: "friend_invited",
    description: `Shared Colorful Memories with ${email}`,
  });
  console.log(JSON.stringify({ level: "info", message: "friend invite emailed", userId: user.id }));
  return { data: { sent: true }, error: null };
}
