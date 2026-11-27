import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { getUserHistory } from "@/server/adminUserHistoryService";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!requirePermission(auth.user, "usermanage:listusers")) {
    return jsonError("Missing required permission: usermanage:listusers", 403);
  }
  const { id } = await params;
  const result = await getUserHistory(id);
  return jsonResult(result, result.error ? (result.error.code === "NOT_FOUND" ? 404 : 500) : 200);
}
