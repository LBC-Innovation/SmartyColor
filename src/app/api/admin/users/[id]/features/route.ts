import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as admin from "@/server/adminUsersService";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.user.role !== "admin" && !requirePermission(auth.user, "usermanage:editpermissions")) {
    return jsonError("Missing required permission: usermanage:editpermissions", 403);
  }
  const body = (await request.json()) as { features?: unknown };
  const result = await admin.setFeatureAccess(id, body.features, auth.user.id);
  if (result.error) {
    return jsonResult(result, result.error.message === "User not found" ? 404 : 400);
  }
  return jsonResult(result);
}
