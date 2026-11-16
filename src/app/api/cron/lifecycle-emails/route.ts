import { timingSafeEqual } from "node:crypto";
import { jsonError } from "@/lib/api/respond";
import { runLifecycleEmails } from "@/server/marketing/lifecycleEmailService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron: unfinished-book reminders, review requests and referral-credit notes, once a day. */
export async function GET(request: Request) {
  if (!authorized(request)) return jsonError("Unauthorized", 401);
  const summary = await runLifecycleEmails();
  return Response.json({ data: summary, error: null });
}
