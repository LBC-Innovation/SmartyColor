import { jsonError, jsonResult } from "@/lib/api/respond";
import { setMarketingOptOut } from "@/server/email/marketingOptOut";
import { verifyToken } from "@/server/email/signedLinks";

export const runtime = "nodejs";

/**
 * POST ?t=<token>: one-click unsubscribe from mail apps (RFC 8058) and the unsubscribe page.
 * A JSON body of `{ "subscribe": true }` turns marketing email back on.
 */
export async function POST(request: Request) {
  const userId = verifyToken("unsubscribe", new URL(request.url).searchParams.get("t"));
  if (!userId) return jsonError("This link is not valid.", 400);
  let subscribe = false;
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { subscribe?: unknown } | null;
    subscribe = body?.subscribe === true;
  }
  const ok = await setMarketingOptOut(userId, !subscribe);
  if (!ok) return jsonError("Could not update your email settings. Please try again.", 500);
  return jsonResult({ data: { subscribed: subscribe }, error: null });
}
