import { after } from "next/server";
import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as orders from "@/server/ordersService";

type Params = { params: Promise<{ id: string }> };

/** Admin: cancel any customer's order while Lulu still allows it; the wallet is refunded. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes("usermanage:manageorders")) {
    return jsonError("Missing required permission: usermanage:manageorders", 403);
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason : null;

  const result = await orders.cancelBookOrder({
    orderId: id,
    actor: { kind: "admin", id: auth.user.id },
    reason,
  });
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, result.error.code);
  if (result.error?.code === "NOT_CANCELABLE") return jsonError(result.error.message, 409, result.error.code);
  if (!result.error) after(() => orders.sendOrderCanceledEmail(id));
  return jsonResult(result, result.error ? 500 : 200);
}
