import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as admin from "@/server/adminUsersService";

export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (
    auth.user.role !== "admin" &&
    !requirePermission(auth.user, "usermanage:listusers")
  ) {
    return jsonError("Missing required permission: usermanage:listusers", 403);
  }
  const result = await admin.listAdminUsers();
  if (result.error) return jsonResult(result, 500);
  return jsonResult(result);
}

export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!requirePermission(auth.user, "usermanage:add")) {
    return jsonError("Missing required permission: usermanage:add", 403);
  }
  const body = (await request.json()) as { email?: string; password?: string };
  if (!body.email || !body.password) {
    return jsonError("email and password are required", 400);
  }
  const result = await admin.createAdminUser(body.email, body.password, auth.user.id);
  if (result.error) return jsonResult(result, 500);
  return jsonResult(result, 201);
}
