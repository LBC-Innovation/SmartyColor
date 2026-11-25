import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { copyPhotosIntoProject } from "@/server/yearAlbumService";

// Copies every chosen photo and its pages inside storage.
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/** Copies of photos from the caller's albums added to this album: body { photoIds }. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { photoIds?: unknown };
  const result = await copyPhotosIntoProject(auth.user.id, id, body.photoIds);
  const code = result.error?.code;
  if (code === "INVALID") return jsonError(result.error!.message, 400, code);
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  return jsonResult(result, result.error ? 500 : 201);
}
