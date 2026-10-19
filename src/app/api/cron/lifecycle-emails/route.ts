import { timingSafeEqual } from "node:crypto";
import { jsonError } from "@/lib/api/respond";
import { runLifecycleEmails } from "@/server/email/lifecycleService";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Vercel cron sends `Authorization: Bearer $CRON_SECRET`. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily at 15:00 UTC (vercel.json; Hobby plans allow one run a day). `?dryRun=1` lists what would go out without sending or recording;
 * `?user=<id>` limits the run to one account, for testing against the live database.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return jsonError("Unauthorized", 401);
  const url = new URL(request.url);
  const userId = url.searchParams.get("user")?.trim() || undefined;
  if (userId && !/^[0-9a-f-]{36}$/i.test(userId)) return jsonError("Invalid user id", 400);
  const summary = await runLifecycleEmails({ dryRun: url.searchParams.get("dryRun") === "1", userId });
  return Response.json({ data: summary, error: null }, { status: summary.errors.length ? 500 : 200 });
}
