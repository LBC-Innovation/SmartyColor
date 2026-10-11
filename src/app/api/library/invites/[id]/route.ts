import { jsonError, jsonResult } from "@/lib/api/respond";
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
