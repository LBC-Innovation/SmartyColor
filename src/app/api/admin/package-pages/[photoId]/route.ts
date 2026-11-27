import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { PURCHASE_CODES_PERMISSION } from "@/lib/purchaseCodes/permissions";
import { setPackagePage } from "@/server/adminUserAlbumsService";

type Params = { params: Promise<{ photoId: string }> };

/** Includes a page in its album's pre-paid book ({ include: true }) or takes it out. */
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes(PURCHASE_CODES_PERMISSION)) {
    return jsonError(`Missing required permission: ${PURCHASE_CODES_PERMISSION}`, 403);
  }
  const { photoId } = await params;
  let body: { include?: unknown };
  try {
    body = (await request.json()) as { include?: unknown };
  } catch {
    return jsonError("Send { include: true | false }.", 400);
  }
  if (typeof body.include !== "boolean") return jsonError("Send { include: true | false }.", 400);
  const result = await setPackagePage(auth.user.id, photoId, body.include);
  const status = !result.error ? 200 : result.error.code === "NOT_FOUND" ? 404 : result.error.code === "INVALID" ? 409 : 500;
  return jsonResult(result, status);
}
