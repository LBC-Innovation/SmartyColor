import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as orders from "@/server/ordersService";

type Params = { params: Promise<{ id: string }> };

function canManageOrders(permissions: string[]): boolean {
  return permissions.includes("usermanage:manageorders");
}

/**
 * Admin: submit (or retry submitting) a paid physical order to Lulu. With `{ "rebuild": true }` a
 * failed order whose Lulu job was rejected or canceled gets its print files rebuilt first.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManageOrders(auth.user.permissions)) {
    return jsonError("Missing required permission: usermanage:manageorders", 403);
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { rebuild?: unknown } | null;
  const result =
    body?.rebuild === true
      ? await orders.rebuildAndResubmitOrderToLulu(id)
      : await orders.submitOrderToLulu(id);
  if (result.error?.code === "NOT_FOUND") {
    return jsonError(result.error.message, 404, result.error.code);
  }
  if (result.error?.code === "INVALID_STATE") {
    return jsonError(result.error.message, 409, result.error.code);
  }
  return jsonResult(result, result.error ? 500 : 200);
}
