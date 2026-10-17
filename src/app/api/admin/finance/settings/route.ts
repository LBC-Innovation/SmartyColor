import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { FINANCE_MANAGE_PERMISSION } from "@/lib/finance/types";
import { canManageFinance } from "@/server/financeAccess";
import { parseSettingsInput, updateFinanceSettings } from "@/server/financeService";

/** Card-fee rate and the opening cash balance used for cash on hand and runway. */
export async function PUT(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManageFinance(auth.user)) {
    return jsonError(`Missing required permission: ${FINANCE_MANAGE_PERMISSION}`, 403);
  }

  const input = parseSettingsInput((await request.json()) as Record<string, unknown>);
  if ("error" in input) return jsonError(input.error, 400);
  const result = await updateFinanceSettings(input, auth.user.id);
  return jsonResult(result, result.error ? 400 : 200);
}
