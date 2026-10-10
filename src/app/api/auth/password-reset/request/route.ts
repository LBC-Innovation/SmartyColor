import { jsonError, jsonResult } from "@/lib/api/respond";
import { authNotConfiguredMessage, supabaseServiceConfigured } from "@/lib/supabase/service";
import * as authService from "@/server/authService";

export async function POST(request: Request) {
  if (!supabaseServiceConfigured()) {
    return jsonError(authNotConfiguredMessage(), 503);
  }
  const body = (await request.json()) as { email?: string; redirectTo?: string };
  if (!body.email) return jsonError("email is required", 400);
  const result = await authService.passwordResetRequest(body.email, body.redirectTo);
  if (result.error) return jsonResult(result, 500);
  return jsonResult(result);
}
