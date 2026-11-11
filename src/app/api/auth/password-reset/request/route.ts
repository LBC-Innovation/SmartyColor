import { jsonError, jsonResult } from "@/lib/api/respond";
import { clientOrigins } from "@/lib/auth/clientOrigin";
import { authNotConfiguredMessage, supabaseServiceConfigured } from "@/lib/supabase/service";
import * as authService from "@/server/authService";

/** Only the app's own addresses may receive the reset link; anything else falls back to the default. */
function ownRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    return clientOrigins().includes(new URL(value).origin) ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  if (!supabaseServiceConfigured()) {
    return jsonError(authNotConfiguredMessage(), 503);
  }
  const body = (await request.json()) as { email?: string; redirectTo?: string };
  if (!body.email) return jsonError("email is required", 400);
  const result = await authService.passwordResetRequest(body.email, ownRedirect(body.redirectTo));
  if (result.error) {
    const limited =
      result.error.code === "over_email_send_rate_limit" || result.error.code === "over_request_rate_limit";
    return jsonResult(result, limited ? 429 : 500);
  }
  return jsonResult(result);
}
