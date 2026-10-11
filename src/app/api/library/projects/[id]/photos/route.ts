import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import type { RegisterPhotoInput } from "@/lib/library/types";
import * as library from "@/server/libraryService";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await library.listPhotos(auth.user.id, id);
  return jsonResult(result, result.error ? 500 : 200);
}

/** Register a photo whose original has already been PUT to its signed URL. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as RegisterPhotoInput | null;
  if (!body || typeof body.id !== "string" || typeof body.mimeType !== "string") {
    return jsonError("id and mimeType are required", 400);
  }
  const result = await library.registerPhoto(auth.user.id, id, body);
  if (result.error?.code === "UPLOAD_MISSING") return jsonError(result.error.message, 409, "UPLOAD_MISSING");
  return jsonResult(result, result.error ? 500 : 201);
}

/** Reorder: body { orderedIds: string[] } */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { orderedIds?: unknown };
  if (!Array.isArray(body.orderedIds) || !body.orderedIds.every((x) => typeof x === "string")) {
    return jsonError("orderedIds must be a string array", 400);
  }
  const result = await library.reorderPhotos(auth.user.id, id, body.orderedIds as string[]);
  return jsonResult(result, result.error ? 500 : 200);
}
