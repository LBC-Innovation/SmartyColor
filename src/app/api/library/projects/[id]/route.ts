import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import type { LibraryProjectPatch } from "@/lib/library/types";
import * as library from "@/server/libraryService";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as LibraryProjectPatch;
  const result = await library.updateProject(auth.user.id, id, body);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, "NOT_FOUND");
  return jsonResult(result, result.error ? 500 : 200);
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await library.deleteProject(auth.user.id, id);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, "NOT_FOUND");
  return jsonResult(result, result.error ? 500 : 200);
}
