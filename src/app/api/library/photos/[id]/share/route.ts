import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as pageShares from "@/server/pageSharesService";

type Params = { params: Promise<{ id: string }> };

/** The page's live share link, or null when it isn't shared. */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await pageShares.getPageShare(auth.user.id, id);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, "NOT_FOUND");
  return jsonResult(result, result.error ? 500 : 200);
}

/** Share the page: body { revisionId } (the coloring page version the link shows). */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { revisionId?: unknown };
  if (typeof body.revisionId !== "string" || !body.revisionId) return jsonError("revisionId is required", 400);
  const result = await pageShares.sharePage(auth.user.id, id, body.revisionId);
  const code = result.error?.code;
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  if (code === "INVALID_REVISION") return jsonError(result.error!.message, 400, code);
  return jsonResult(result, result.error ? 500 : 200);
}

/** Stop sharing: the link stops working immediately. */
export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await pageShares.stopSharingPage(auth.user.id, id);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, "NOT_FOUND");
  return jsonResult(result, result.error ? 500 : 200);
}
