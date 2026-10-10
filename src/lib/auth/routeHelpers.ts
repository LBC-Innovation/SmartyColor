import { authenticateBearer } from "@/lib/auth/authenticate";
import { jsonError } from "@/lib/api/respond";
import { authNotConfiguredMessage, supabaseServiceConfigured } from "@/lib/supabase/service";

export async function requireAuthRequest(request: Request) {
  if (!supabaseServiceConfigured()) {
    return { error: jsonError(authNotConfiguredMessage(), 503) } as const;
  }
  const result = await authenticateBearer(request.headers.get("authorization"));
  if ("error" in result) {
    return {
      error: jsonError(result.error.message, result.error.status, result.error.code),
    } as const;
  }
  return { user: result.user } as const;
}
