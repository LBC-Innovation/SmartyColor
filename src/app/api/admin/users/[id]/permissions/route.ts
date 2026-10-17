import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as admin from "@/server/adminUsersService";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  // Never through self-management: an account must not be able to grant itself permissions.
  if (!requirePermission(auth.user, "usermanage:editpermissions")) {
    return jsonError("Missing required permission: usermanage:editpermissions", 403);
  }
  const body = (await request.json()) as { permissions?: unknown };
  const result = await admin.setPermissions(id, body.permissions, auth.user.id);
  if (result.error) return jsonResult(result, 400);
  return jsonResult(result);
}
