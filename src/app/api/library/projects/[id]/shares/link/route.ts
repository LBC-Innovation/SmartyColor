import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as shares from "@/server/albumSharesService";

type Params = { params: Promise<{ id: string }> };

/** Make a single-use invite link for the album, to send by text message or another app. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await shares.createInviteLink(auth.user, id);
  const code = result.error?.code;
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  if (code === "LIMIT") return jsonError(result.error!.message, 429, code);
  return jsonResult(result, result.error ? 500 : 201);
}
