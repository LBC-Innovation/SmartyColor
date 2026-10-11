import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as shares from "@/server/albumSharesService";

type Params = { params: Promise<{ id: string; shareId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id, shareId } = await params;
  const result = await shares.resendShare(auth.user, id, shareId);
  const code = result.error?.code;
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  if (code === "TOO_SOON") return jsonError(result.error!.message, 429, code);
  if (code === "EMAIL_FAILED") return jsonError(result.error!.message, 502, code);
  return jsonResult(result, result.error ? 500 : 200);
}
