import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { listYearPhotos } from "@/server/yearAlbumService";

type Params = { params: Promise<{ year: string }> };

/** Photos in the caller's own albums uploaded during `year`. */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { year } = await params;
  const result = await listYearPhotos(auth.user.id, Number(year));
  if (result.error?.code === "INVALID") return jsonError(result.error.message, 400, "INVALID");
  return jsonResult(result, result.error ? 500 : 200);
}
