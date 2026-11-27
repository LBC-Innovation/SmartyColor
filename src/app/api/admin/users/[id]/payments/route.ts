import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { listUserPayments } from "@/server/adminPaymentsService";

type Params = { params: Promise<{ id: string }> };

/** Wallet and card payments together, for the customer drawer's Payments tab. */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const p = auth.user.permissions;
  if (!p.includes("usermanage:adjustcredits") && !p.includes("usermanage:refundpayments")) {
    return jsonError("Missing required permission: usermanage:adjustcredits", 403);
  }
  const { id } = await params;
  const result = await listUserPayments(id);
  return jsonResult(result, result.error ? 500 : 200);
}
