import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { PACKAGE_NOT_CANCELABLE_CODE } from "@/lib/bookPackages/types";
import { cancelBookPackage, getPackageRefundQuote } from "@/server/bookPackagesService";
import { deleteProject } from "@/server/libraryService";

type Params = { params: Promise<{ id: string }> };

/** What canceling this album's book package would return to the wallet (data is null without one). */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await getPackageRefundQuote(auth.user.id, id);
  return jsonResult(result, result.error ? 500 : 200);
}

/**
 * Cancel the album's book package and return its unused value to the wallet. Body
 * `{ deleteAlbum: boolean }`: delete the album too, or keep it (and its pages) as a normal album.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { deleteAlbum?: unknown };
  if (typeof body.deleteAlbum !== "boolean") return jsonError("deleteAlbum must be true or false", 400);

  const result = await cancelBookPackage({
    userId: auth.user.id,
    projectId: id,
    deleteAlbum: body.deleteAlbum,
    deleteProject,
  });
  if (result.error) {
    return jsonResult(result, result.error.code === PACKAGE_NOT_CANCELABLE_CODE ? 409 : 500);
  }
  return jsonResult(result, 200);
}
