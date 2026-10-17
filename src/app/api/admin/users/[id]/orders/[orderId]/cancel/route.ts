import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as orders from "@/server/ordersService";

type Params = { params: Promise<{ id: string; orderId: string }> };

function canManageOrders(permissions: string[]): boolean {
  return permissions.includes("usermanage:manageorders");
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManageOrders(auth.user.permissions)) {
    return jsonError("Missing required permission: usermanage:manageorders", 403);
  }

  const { id, orderId } = await params;
  const result = await orders.cancelOrderAsAdmin({
    userId: id,
    orderId,
    adminId: auth.user.id,
  });

  if (result.error?.code === "NOT_FOUND") {
    return jsonError(result.error.message, 404, result.error.code);
  }
  return jsonResult(result, result.error ? 400 : 200);
}
