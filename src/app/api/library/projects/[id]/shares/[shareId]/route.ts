import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as shares from "@/server/albumSharesService";

type Params = { params: Promise<{ id: string; shareId: string }> };

/** Owner removes an invite; a contributor leaves with shareId "me". */
export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id, shareId } = await params;
  const result = await shares.removeShare(auth.user.id, id, shareId);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, "NOT_FOUND");
  return jsonResult(result, result.error ? 500 : 200);
}
