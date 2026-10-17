import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { FINANCE_VIEW_PERMISSION } from "@/lib/finance/types";
import { canViewFinance } from "@/server/financeAccess";
import { getFinanceReport } from "@/server/financeService";

export const dynamic = "force-dynamic";

/** Cash flow, P&L, margins by product and insights for ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive). */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canViewFinance(auth.user)) {
    return jsonError(`Missing required permission: ${FINANCE_VIEW_PERMISSION}`, 403);
  }

  const url = new URL(request.url);
  const result = await getFinanceReport({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  return jsonResult(result, result.error ? 400 : 200);
}
