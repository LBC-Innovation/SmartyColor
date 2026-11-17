import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as admin from "@/server/adminUsersService";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!requirePermission(auth.user, "usermanage:verifyemail")) {
    return jsonError("Missing required permission: usermanage:verifyemail", 403);
  }
  const result = await admin.unverifyUser(id, auth.user.id);
  if (result.error) return jsonResult(result, 500);
  return jsonResult(result);
}
