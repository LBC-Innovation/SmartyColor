import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { getUserAlbums } from "@/server/adminUserAlbumsService";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!requirePermission(auth.user, "usermanage:listusers")) {
    return jsonError("Missing required permission: usermanage:listusers", 403);
  }
  const { id } = await params;
  const result = await getUserAlbums(id);
  return jsonResult(result, result.error ? 500 : 200);
}
