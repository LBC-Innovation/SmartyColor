import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermissionOrSelfManage } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as admin from "@/server/adminUsersService";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuthRequest(_request);
  if ("error" in auth) return auth.error;
  if (!requirePermissionOrSelfManage(auth.user, id, "usermanage:verifyemail")) {
    return jsonError("Missing required permission: usermanage:verifyemail", 403);
  }
  const result = await admin.resendVerification(id, auth.user.id);
  if (result.error) return jsonResult(result, 400);
  return jsonResult(result);
}
