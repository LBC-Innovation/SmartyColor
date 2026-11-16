import { timingSafeEqual } from "node:crypto";
import { jsonError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/service";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Vercel Cron: clears guest IP addresses and locations from AI cost records older than 12 months,
 * as promised on /terms. The cost, time and action of each call stay.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return jsonError("Unauthorized", 401);
  const { data, error } = await getSupabaseAdmin().rpc("scrub_old_guest_locations");
  if (error) {
    console.error(JSON.stringify({ level: "error", message: "guest retention failed", error: error.message }));
    return jsonError(error.message, 500);
  }
  const scrubbed = Number(data ?? 0);
  console.log(JSON.stringify({ level: "info", message: "guest retention ran", scrubbed }));
  return Response.json({ data: { scrubbed }, error: null });
}
