import { jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as authService from "@/server/authService";

export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const result = await authService.getMe(auth.user);
  if (result.error) return jsonResult(result, 404);
  return jsonResult(result);
}
