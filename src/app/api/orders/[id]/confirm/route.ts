import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as orders from "@/server/ordersService";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const result = await orders.confirmDraftBookOrder({
    userId: auth.user.id,
    orderId: id,
  });

  if (result.error?.code === "NOT_FOUND") {
    return jsonError(result.error.message, 404, result.error.code);
  }
  if (result.error?.code === "INVALID_STATE") {
    return jsonError(result.error.message, 409, result.error.code);
  }
  const code = result.error?.code;
  if (
    code === "ADDRESS_REQUIRED" ||
    code === "BOOK_INCOMPLETE" ||
    code === "PROOF_REQUIRED" ||
    code === "COVER_REQUIRED" ||
    code === "COVER_INVALID" ||
    code === "INVALID_PAGES"
  ) {
    return jsonError(result.error!.message, 400, code);
  }
  return jsonResult(result, result.error ? 500 : 200);
}
