import { jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { getAlbumPurchaseCode } from "@/server/purchaseCodesService";

type Params = { params: Promise<{ id: string }> };

/** The album's purchase code and what is left of it (data is null when it has none). */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await getAlbumPurchaseCode(auth.user.id, id);
  return jsonResult(result, result.error ? (result.error.code === "NOT_FOUND" ? 404 : 500) : 200);
}
