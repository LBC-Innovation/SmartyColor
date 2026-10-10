import { jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as authService from "@/server/authService";

export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const token = request.headers.get("authorization")!.slice(7);
  const result = await authService.logout(token, auth.user.id);
  if (result.error) return jsonResult(result, 500);
  return jsonResult(result);
}
