import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { attributionFromRequest } from "@/lib/marketing/attribution";
import { redeemPurchaseCode } from "@/server/purchaseCodesService";

type Params = { params: Promise<{ code: string }> };

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_STATE: 409,
  ALREADY_REDEEMED: 409,
  ALBUM_HAS_CODE: 409,
};

/** Binds the code to an album the caller owns (`albumId`) or to a new album (`albumName`). */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { code } = await params;
  const body = (await request.json().catch(() => null)) as { albumId?: unknown; albumName?: unknown } | null;
  if (body?.albumId !== undefined && body.albumId !== null && typeof body.albumId !== "string") {
    return jsonError("albumId must be a string", 400);
  }
  const result = await redeemPurchaseCode({
    code,
    userId: auth.user.id,
    albumId: typeof body?.albumId === "string" ? body.albumId : null,
    albumName: typeof body?.albumName === "string" ? body.albumName : null,
    attribution: attributionFromRequest(request),
  });
  return jsonResult(result, result.error ? (STATUS[result.error.code ?? ""] ?? 500) : 200);
}
