import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as library from "@/server/libraryService";

type Params = { params: Promise<{ id: string }> };

/** Register an uploaded revision: body { revisionId, mimeType, title?, makeActive? } */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    revisionId?: string;
    mimeType?: string;
    title?: string;
    makeActive?: boolean;
  };
  if (typeof body.revisionId !== "string" || typeof body.mimeType !== "string") {
    return jsonError("revisionId and mimeType are required", 400);
  }
  const result = await library.registerRevision(auth.user.id, id, {
    revisionId: body.revisionId,
    mimeType: body.mimeType,
    title: body.title ?? "",
    makeActive: body.makeActive ?? true,
  });
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, "NOT_FOUND");
  if (result.error?.code === "UPLOAD_MISSING") return jsonError(result.error.message, 409, "UPLOAD_MISSING");
  return jsonResult(result, result.error ? 500 : 201);
}
