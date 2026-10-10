import { jsonError, jsonResult } from "@/lib/api/respond";
import { authNotConfiguredMessage, supabaseServiceConfigured } from "@/lib/supabase/service";
import * as authService from "@/server/authService";

export async function POST(request: Request) {
  if (!supabaseServiceConfigured()) {
    return jsonError(authNotConfiguredMessage(), 503);
  }
  const body = (await request.json()) as { access_token?: string; password?: string };
  if (!body.access_token || !body.password) {
    return jsonError("access_token and password are required", 400);
  }
  const result = await authService.passwordResetConfirm(body.access_token, body.password);
  if (result.error) return jsonResult(result, 400);
  return jsonResult(result);
}
