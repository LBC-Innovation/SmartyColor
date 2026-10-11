import { jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as credits from "@/server/creditsService";

/** The signed-in user's own credit history. */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const result = await credits.listCreditLedgerForUser(auth.user.id);
  return jsonResult(result, result.error ? 500 : 200);
}
