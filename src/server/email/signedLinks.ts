import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Links in emails that act without a sign-in (unsubscribe, the review form) carry a signed token
 * naming the account or order, so nobody can act for someone else by editing the link.
 */

type Purpose = "unsubscribe" | "feedback";

function secret(): string {
  const key = process.env.EMAIL_LINK_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("EMAIL_LINK_SECRET is not set");
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signToken(purpose: Purpose, subjectId: string): string {
  const payload = Buffer.from(`${purpose}:${subjectId}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The id the token was signed for, or null when it is malformed, forged or for another purpose. */
export function verifyToken(purpose: Purpose, token: string | null | undefined): string | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const prefix = `${purpose}:`;
  if (!decoded.startsWith(prefix)) return null;
  const id = decoded.slice(prefix.length);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
