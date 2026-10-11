import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as library from "@/server/libraryService";

type Params = { params: Promise<{ id: string }> };
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Signed PUT for a sheet revision file (used when migrating local sheets). */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { mimeType?: string };
  if (!body.mimeType || !ALLOWED.has(body.mimeType)) return jsonError("Unsupported image type", 400);
  const result = await library.createRevisionUpload(auth.user.id, id, body.mimeType);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, "NOT_FOUND");
  return jsonResult(result, result.error ? 500 : 200);
}
