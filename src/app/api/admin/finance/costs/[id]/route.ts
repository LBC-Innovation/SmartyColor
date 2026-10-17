import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { FINANCE_MANAGE_PERMISSION } from "@/lib/finance/types";
import { canManageFinance } from "@/server/financeAccess";
import { deleteFinanceCost, parseCostInput, updateFinanceCost } from "@/server/financeService";

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorize(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth;
  if (!canManageFinance(auth.user)) {
    return { error: jsonError(`Missing required permission: ${FINANCE_MANAGE_PERMISSION}`, 403) };
  }
  return auth;
}

/** Change a cost. */
export async function PUT(request: Request, { params }: Params) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError("Cost not found", 404, "NOT_FOUND");

  const input = parseCostInput((await request.json()) as Record<string, unknown>);
  if ("error" in input) return jsonError(input.error, 400);
  const result = await updateFinanceCost(id, input, auth.user.id);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, result.error.code);
  return jsonResult(result, result.error ? 400 : 200);
}

/** Remove a cost entered by mistake. To stop a recurring cost, set its end date instead. */
export async function DELETE(request: Request, { params }: Params) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError("Cost not found", 404, "NOT_FOUND");

  const result = await deleteFinanceCost(id);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, result.error.code);
  return jsonResult(result, result.error ? 400 : 200);
}
