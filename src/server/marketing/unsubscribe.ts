import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { clientOrigin } from "@/lib/auth/clientOrigin";

/**
 * Signed unsubscribe links for reminder and review-request emails: /unsubscribe?u=<user id>&t=<sig>.
 * The signature proves the link came from us, so no sign-in is needed to opt out.
 */

function secret(): string | null {
  return (
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  );
}

function sign(userId: string): string | null {
  const key = secret();
  if (!key) return null;
  return createHmac("sha256", key).update(`unsubscribe:${userId}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribe(userId: string, token: string): boolean {
  const expected = sign(userId);
  if (!expected || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The page link (shown in the email) and the one-click POST target (List-Unsubscribe header). */
export function unsubscribeUrls(userId: string): { page: string; oneClick: string } | null {
  const token = sign(userId);
  if (!token) return null;
  const qs = `u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
  return { page: `${clientOrigin()}/unsubscribe?${qs}`, oneClick: `${clientOrigin()}/api/unsubscribe?${qs}` };
}
