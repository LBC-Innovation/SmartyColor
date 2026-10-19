import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { createProjectFromPhotos } from "@/server/yearAlbumService";

// Copies every chosen photo and its pages inside storage.
export const maxDuration = 60;

/** A new album holding copies of photos from the caller's albums: body { name, photoIds }. */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; photoIds?: unknown };
  const name = typeof body.name === "string" ? body.name.slice(0, 120) : "";
  const result = await createProjectFromPhotos(auth.user.id, name, body.photoIds);
  const code = result.error?.code;
  if (code === "INVALID") return jsonError(result.error!.message, 400, code);
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  return jsonResult(result, result.error ? 500 : 201);
}
