import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { getCardChargeDetails } from "@/server/adminPaymentsService";

type Params = { params: Promise<{ id: string }> };

/** Live Stripe details for one card charge: card, Stripe receipt, dashboard link, refunds. */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const p = auth.user.permissions;
  if (!p.includes("usermanage:adjustcredits") && !p.includes("usermanage:refundpayments")) {
    return jsonError("Missing required permission: usermanage:adjustcredits", 403);
  }
  const { id } = await params;
  const sessionId = new URL(request.url).searchParams.get("session") ?? "";
  if (!/^cs_[A-Za-z0-9_]{8,250}$/.test(sessionId)) return jsonError("session is required", 400);
  const result = await getCardChargeDetails(id, sessionId);
  return jsonResult(result, result.error ? (result.error.code === "NOT_FOUND" ? 404 : 502) : 200);
}
