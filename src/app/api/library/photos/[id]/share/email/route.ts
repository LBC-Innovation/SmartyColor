import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { emailPageShare } from "@/server/pageShareEmailService";

type Params = { params: Promise<{ id: string }> };

/**
 * Email this coloring page's share link to someone: body { revisionId, email, note? }.
 * Turns the link on if it isn't already. Signed-in only.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { revisionId?: unknown; email?: unknown; note?: unknown };
  if (typeof body.revisionId !== "string" || !body.revisionId) return jsonError("revisionId is required", 400);
  if (typeof body.email !== "string") return jsonError("email is required", 400);
  const result = await emailPageShare({
    user: auth.user,
    photoId: id,
    revisionId: body.revisionId,
    email: body.email,
    note: typeof body.note === "string" ? body.note : "",
  });
  const code = result.error?.code;
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  if (code === "INVALID_EMAIL" || code === "INVALID_REVISION") return jsonError(result.error!.message, 400, code);
  if (code === "LIMIT") return jsonError(result.error!.message, 429, code);
  if (code === "UNAVAILABLE") return jsonError(result.error!.message, 503, code);
  return jsonResult(result, result.error ? 500 : 200);
}
