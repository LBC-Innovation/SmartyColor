import { jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { getReferralSummary } from "@/server/referralService";

/** The caller's Share with a friend link and what it has earned. */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const result = await getReferralSummary(auth.user);
  return jsonResult(result, result.error ? 500 : 200);
}
