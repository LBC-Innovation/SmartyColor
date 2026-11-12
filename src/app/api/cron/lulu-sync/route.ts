import { timingSafeEqual } from "node:crypto";
import { jsonError } from "@/lib/api/respond";
import * as orders from "@/server/ordersService";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron: refresh in-flight Lulu orders in case a webhook was missed. */
export async function GET(request: Request) {
  if (!authorized(request)) return jsonError("Unauthorized", 401);
  const result = await orders.syncActiveLuluOrders();
  return Response.json({ data: result, error: null });
}
