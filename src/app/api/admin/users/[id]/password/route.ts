import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermissionOrSelf } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as admin from "@/server/adminUsersService";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!requirePermissionOrSelf(auth.user, id, "usermanage:updatepassword")) {
    return jsonError("Missing required permission: usermanage:updatepassword", 403);
  }
  const body = (await request.json()) as { password?: string };
  const result = await admin.resetPassword(id, body.password ?? "", auth.user.id);
  if (result.error) return jsonResult(result, result.error.message.includes("6") ? 400 : 500);
  return jsonResult(result);
}
