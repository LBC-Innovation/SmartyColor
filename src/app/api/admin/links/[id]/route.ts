import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { setLinkArchived } from "@/server/marketing/acquisitionService";

type Params = { params: Promise<{ id: string }> };

/** Archive (stop redirecting) or restore a campaign link. Body: { archived: boolean }. */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes("finance:manage")) return jsonError("Missing required permission: finance:manage", 403);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Not found", 404);
  const body = (await request.json().catch(() => null)) as { archived?: unknown } | null;
  if (typeof body?.archived !== "boolean") return jsonError("archived must be true or false", 400);
  const result = await setLinkArchived(id, body.archived);
  return jsonResult(result, result.error ? 400 : 200);
}
