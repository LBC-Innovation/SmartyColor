import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as orders from "@/server/ordersService";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const url = new URL(request.url);
  const sync = url.searchParams.get("sync") !== "0";

  const result = await orders.getOrderForUser(auth.user.id, id, { syncLulu: sync });
  if (result.error?.code === "NOT_FOUND") {
    return jsonError(result.error.message, 404, result.error.code);
  }
  return jsonResult(result, result.error ? 500 : 200);
}
