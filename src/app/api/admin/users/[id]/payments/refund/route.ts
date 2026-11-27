import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import { refundCardPayment, sendPaymentReceipt } from "@/server/adminPaymentsService";

type Params = { params: Promise<{ id: string }> };

/** Refund a card payment (a wallet top-up or a card-paid book package) back to the card. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes("usermanage:refundpayments")) {
    return jsonError("Missing required permission: usermanage:refundpayments", 403);
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.sessionId !== "string" || !/^cs_[A-Za-z0-9_]{8,250}$/.test(body.sessionId)) {
    return jsonError("sessionId is required", 400);
  }
  if (typeof body.amountCents !== "number" || !Number.isInteger(body.amountCents) || body.amountCents <= 0) {
    return jsonError("amountCents must be a positive integer", 400);
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;

  const result = await refundCardPayment(id, auth.user.id, {
    sessionId: body.sessionId,
    amountCents: body.amountCents,
    cancelPackage: body.cancelPackage === true,
    note,
  });
  if (result.error) return jsonResult(result, result.error.code === "NOT_FOUND" ? 404 : 400);

  // The receipt is best effort: the refund has already happened.
  let emailSent: boolean | undefined;
  if (body.notifyUser === true && result.data.status === "succeeded") {
    const sent = await sendPaymentReceipt({
      userId: id,
      entryId: `refund:${result.data.refundId}`,
      adminId: auth.user.id,
      message: note,
      accountUrl: `${clientOrigin()}/account`,
    });
    emailSent = sent.data?.emailSent ?? false;
  }
  return jsonResult({ data: { ...result.data, emailSent }, error: null });
}
