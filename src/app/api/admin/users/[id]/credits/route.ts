import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as credits from "@/server/creditsService";

type Params = { params: Promise<{ id: string }> };

function canAdjustCredits(role: string, permissions: string[]): boolean {
  return role === "admin" || permissions.includes("usermanage:adjustcredits");
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canAdjustCredits(auth.user.role, auth.user.permissions)) {
    return jsonError("Missing required permission: usermanage:adjustcredits", 403);
  }

  const { id } = await params;
  const result = await credits.listCreditLedgerForUser(id);
  return jsonResult(result, result.error ? 500 : 200);
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canAdjustCredits(auth.user.role, auth.user.permissions)) {
    return jsonError("Missing required permission: usermanage:adjustcredits", 403);
  }

  const { id } = await params;
  const body = (await request.json()) as { delta?: unknown; note?: unknown };
  if (typeof body.delta !== "number" || !Number.isInteger(body.delta)) {
    return jsonError("delta must be an integer", 400);
  }
  const note = typeof body.note === "string" ? body.note : undefined;

  const result = await credits.adjustUserCredits({
    userId: id,
    delta: body.delta,
    adminId: auth.user.id,
    note,
  });

  if (result.error) {
    const status = result.error.message.includes("not found") ? 404 : 400;
    return jsonResult(result, status);
  }
  return jsonResult(result);
}
