import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { cancelPackageToWallet } from "@/server/adminPaymentsService";

type Params = { params: Promise<{ id: string }> };

/** Cancel a customer's book package with the unused value returned to their wallet. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes("usermanage:adjustcredits")) {
    return jsonError("Missing required permission: usermanage:adjustcredits", 403);
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.packageId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.packageId)) {
    return jsonError("packageId is required", 400);
  }
  const result = await cancelPackageToWallet(id, body.packageId, auth.user.id);
  return jsonResult(result, result.error ? (result.error.code === "NOT_FOUND" ? 404 : 400) : 200);
}
