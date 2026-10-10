import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAdminOrSelfManage } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as admin from "@/server/adminUsersService";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!requireAdminOrSelfManage(auth.user, id)) return jsonError("Forbidden", 403);
  const body = (await request.json()) as { email?: string };
  const result = await admin.updateUserEmail(id, body.email ?? "", auth.user.id);
  if (result.error) return jsonResult(result, 400);
  return jsonResult(result);
}
