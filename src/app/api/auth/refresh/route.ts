import { jsonError, jsonResult } from "@/lib/api/respond";
import { authNotConfiguredMessage, supabaseServiceConfigured } from "@/lib/supabase/service";
import * as authService from "@/server/authService";

/** Trade a refresh token for a new session. 401 means the session is over; 503 means try again. */
export async function POST(request: Request) {
  if (!supabaseServiceConfigured()) {
    return jsonError(authNotConfiguredMessage(), 503);
  }
  const body = (await request.json().catch(() => ({}))) as { refresh_token?: string };
  if (!body.refresh_token) {
    return jsonError("refresh_token is required", 400);
  }
  const result = await authService.refreshSession(body.refresh_token);
  if (result.error) {
    return jsonResult(result, result.error.code === "UNAVAILABLE" ? 503 : 401);
  }
  return jsonResult(result);
}
