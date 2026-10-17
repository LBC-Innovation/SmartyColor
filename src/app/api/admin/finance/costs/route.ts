import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { FINANCE_MANAGE_PERMISSION } from "@/lib/finance/types";
import { canManageFinance } from "@/server/financeAccess";
import { createFinanceCost, parseCostInput } from "@/server/financeService";

/** Add a fixed or operating cost. */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManageFinance(auth.user)) {
    return jsonError(`Missing required permission: ${FINANCE_MANAGE_PERMISSION}`, 403);
  }

  const input = parseCostInput((await request.json()) as Record<string, unknown>);
  if ("error" in input) return jsonError(input.error, 400);
  const result = await createFinanceCost(input, auth.user.id);
  return jsonResult(result, result.error ? 400 : 201);
}
