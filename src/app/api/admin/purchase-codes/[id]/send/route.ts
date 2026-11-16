import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { PURCHASE_CODES_PERMISSION } from "@/lib/purchaseCodes/permissions";
import type { PurchaseCodeChannel } from "@/lib/purchaseCodes/types";
import { emailPurchaseCode, recordPurchaseCodeSend } from "@/server/purchaseCodesService";

type Params = { params: Promise<{ id: string }> };

const CHANNELS: PurchaseCodeChannel[] = ["email", "sms", "print", "link"];

/**
 * Sends or logs a code. `email` sends it from here; `sms`, `print` and `link` happen on the
 * admin's own device (Messages, the printer, the clipboard), so they are only logged.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes(PURCHASE_CODES_PERMISSION)) {
    return jsonError(`Missing required permission: ${PURCHASE_CODES_PERMISSION}`, 403);
  }
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { channel?: unknown; to?: unknown } | null;
  const channel = body?.channel as PurchaseCodeChannel;
  if (!CHANNELS.includes(channel)) return jsonError("channel must be email, sms, print or link", 400);
  const to = typeof body?.to === "string" ? body.to : null;

  if (channel === "email") {
    if (!to) return jsonError("Who should it go to?", 400);
    const result = await emailPurchaseCode({ id, to, adminId: auth.user.id });
    const status = result.error ? (result.error.code === "NOT_FOUND" ? 404 : result.error.code === "INVALID_STATE" ? 409 : 400) : 200;
    return jsonResult(result, status);
  }
  const result = await recordPurchaseCodeSend(id, channel, to, auth.user.id);
  return jsonResult(result, result.error ? 500 : 200);
}
