import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { PURCHASE_CODES_PERMISSION } from "@/lib/purchaseCodes/permissions";
import { voidPurchaseCode } from "@/server/purchaseCodesService";

type Params = { params: Promise<{ id: string }> };

/** Voids a code that hasn't paid for a book yet. */
export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes(PURCHASE_CODES_PERMISSION)) {
    return jsonError(`Missing required permission: ${PURCHASE_CODES_PERMISSION}`, 403);
  }
  const { id } = await params;
  const result = await voidPurchaseCode(id, auth.user.id);
  return jsonResult(result, result.error ? (result.error.code === "INVALID_STATE" ? 409 : 500) : 200);
}
