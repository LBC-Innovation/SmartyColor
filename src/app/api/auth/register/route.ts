import { jsonError, jsonResult } from "@/lib/api/respond";
import { attributionFromRequest } from "@/lib/marketing/attribution";
import { authNotConfiguredMessage, supabaseServiceConfigured } from "@/lib/supabase/service";
import * as authService from "@/server/authService";
import { saveAttribution } from "@/server/marketing/attributionService";

export async function POST(request: Request) {
  if (!supabaseServiceConfigured()) {
    return jsonError(authNotConfiguredMessage(), 503);
  }
  const body = (await request.json()) as { email?: string; password?: string };
  if (!body.email || !body.password) {
    return jsonError("email and password are required", 400);
  }
  const result = await authService.register(body.email, body.password);
  if (result.error) return jsonResult(result, 400);
  const userId = (result.data as { user?: { id?: string } | null } | null)?.user?.id;
  if (userId) await saveAttribution("profiles", userId, attributionFromRequest(request));
  return jsonResult(result, 201);
}
