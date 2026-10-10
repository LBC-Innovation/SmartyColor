import { jsonError, jsonResult } from "@/lib/api/respond";
import { authNotConfiguredMessage, supabaseServiceConfigured } from "@/lib/supabase/service";
import * as authService from "@/server/authService";

export async function POST(request: Request) {
  if (!supabaseServiceConfigured()) {
    return jsonError(authNotConfiguredMessage(), 503);
  }
  const body = (await request.json()) as { email?: string; password?: string };
  if (!body.email || !body.password) {
    return jsonError("email and password are required", 400);
  }
  const result = await authService.login(body.email, body.password);
  if (result.error) return jsonResult(result, 401);
  return jsonResult(result);
}
