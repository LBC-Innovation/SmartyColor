import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { authNotConfiguredMessage, supabaseServiceConfigured } from "@/lib/supabase/service";
import * as shares from "@/server/albumSharesService";

type Params = { params: Promise<{ id: string }> };

/** Public: the album and inviter behind an invite link, for the sign-up page. */
export async function GET(_request: Request, { params }: Params) {
  if (!supabaseServiceConfigured()) return jsonError(authNotConfiguredMessage(), 503);
  const { id } = await params;
  const result = await shares.getInvitePreview(id);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, "NOT_FOUND");
  return jsonResult(result, result.error ? 500 : 200);
}

/** Join the album behind an invite, as the signed-in person. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await shares.acceptInvite(auth.user, id);
  const code = result.error?.code;
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  if (code === "ALREADY_USED" || code === "OWN_ALBUM") return jsonError(result.error!.message, 409, code);
  if (code === "WRONG_ACCOUNT") return jsonError(result.error!.message, 403, code);
  return jsonResult(result, result.error ? 500 : 200);
}
