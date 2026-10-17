import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as orders from "@/server/ordersService";

type Params = { params: Promise<{ id: string }> };

function canManageOrders(permissions: string[]): boolean {
  return permissions.includes("usermanage:manageorders");
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManageOrders(auth.user.permissions)) {
    return jsonError("Missing required permission: usermanage:manageorders", 403);
  }

  const { id } = await params;
  const url = new URL(request.url);
  const includeHidden = url.searchParams.get("includeHidden") === "1";

  const result = await orders.listOrdersForAdmin(id, { includeHidden });
  return jsonResult(result, result.error ? 500 : 200);
}
