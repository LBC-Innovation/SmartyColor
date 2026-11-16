import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as library from "@/server/libraryService";

type Params = { params: Promise<{ id: string }> };

// Copies the photo and its pages inside storage.
export const maxDuration = 60;

/** Copy a photo into another album: body { projectId } or { newAlbumName }. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { projectId?: unknown; newAlbumName?: unknown };
  let destination: library.PhotoCopyDestination;
  if (typeof body.projectId === "string" && body.projectId) destination = { projectId: body.projectId };
  else if (typeof body.newAlbumName === "string") destination = { newAlbumName: body.newAlbumName.slice(0, 120) };
  else return jsonError("projectId or newAlbumName is required", 400);

  const result = await library.copyPhotoToAlbum(auth.user.id, id, destination);
  const code = result.error?.code;
  if (code === "INVALID") return jsonError(result.error!.message, 400, code);
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  return jsonResult(result, result.error ? 500 : 201);
}
