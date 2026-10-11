import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as shares from "@/server/albumSharesService";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await shares.listShares(auth.user.id, id);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, "NOT_FOUND");
  return jsonResult(result, result.error ? 500 : 200);
}

/** Invite someone to the album: body { email } */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  if (typeof body.email !== "string") return jsonError("email is required", 400);
  const result = await shares.inviteToAlbum(auth.user, id, body.email);
  const code = result.error?.code;
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  if (code === "INVALID_EMAIL") return jsonError(result.error!.message, 400, code);
  if (code === "ALREADY_SHARED") return jsonError(result.error!.message, 409, code);
  if (code === "LIMIT") return jsonError(result.error!.message, 429, code);
  return jsonResult(result, result.error ? 500 : 201);
}
