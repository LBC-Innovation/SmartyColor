import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { BOOK_ORDER_STATUSES, type BookOrderStatus } from "@/lib/orders/types";
import * as orders from "@/server/ordersService";

/** Admin: every customer's orders, newest first. `?status=active` or a single status filters. */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes("usermanage:manageorders")) {
    return jsonError("Missing required permission: usermanage:manageorders", 403);
  }

  const raw = new URL(request.url).searchParams.get("status");
  const status =
    raw === "active"
      ? "active"
      : (BOOK_ORDER_STATUSES as readonly string[]).includes(raw ?? "")
        ? (raw as BookOrderStatus)
        : undefined;
  const result = await orders.listAllOrdersForAdmin({ status });
  return jsonResult(result, result.error ? 500 : 200);
}
