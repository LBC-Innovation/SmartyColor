import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import { sendPaymentReceipt } from "@/server/adminPaymentsService";

type Params = { params: Promise<{ id: string }> };

/** Email the customer a receipt for one payment or refund line. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const p = auth.user.permissions;
  if (!p.includes("usermanage:adjustcredits") && !p.includes("usermanage:refundpayments")) {
    return jsonError("Missing required permission: usermanage:adjustcredits", 403);
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.entryId !== "string" || body.entryId.length > 300) return jsonError("entryId is required", 400);
  const result = await sendPaymentReceipt({
    userId: id,
    entryId: body.entryId,
    adminId: auth.user.id,
    message: typeof body.message === "string" ? body.message.slice(0, 500) : undefined,
    accountUrl: `${clientOrigin()}/account`,
  });
  return jsonResult(result, result.error ? (result.error.code === "NOT_FOUND" ? 404 : 400) : 200);
}
