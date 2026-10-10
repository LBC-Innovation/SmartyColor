import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAdminOrSelfManage, requirePermissionOrSelfManage } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as admin from "@/server/adminUsersService";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!requireAdminOrSelfManage(auth.user, id)) {
    return jsonError("Forbidden", 403);
  }
  const body = (await request.json()) as Record<string, unknown>;
  const updates: { display_name?: string; avatar_url?: string } = {};
  if ("display_name" in body) {
    if (typeof body.display_name !== "string") {
      return jsonError("display_name must be a string", 400);
    }
    updates.display_name = body.display_name;
  }
  if ("avatar_url" in body) {
    if (typeof body.avatar_url !== "string") {
      return jsonError("avatar_url must be a string", 400);
    }
    updates.avatar_url = body.avatar_url;
  }
  const result = await admin.updateProfile(id, updates, auth.user.id);
  if (result.error) return jsonResult(result, 500);
  return jsonResult(result);
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!requirePermissionOrSelfManage(auth.user, id, "usermanage:deleteusers")) {
    return jsonError("Missing required permission: usermanage:deleteusers", 403);
  }
  const result = await admin.deleteUser(id, auth.user.id);
  if (result.error) return jsonResult(result, 500);
  return jsonResult(result);
}
