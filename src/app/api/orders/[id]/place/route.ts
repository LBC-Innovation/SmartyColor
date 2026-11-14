import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { after } from "next/server";
import * as orders from "@/server/ordersService";
import { trackPurchaseServer } from "@/server/marketing/serverTrack";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { timeZone?: unknown } | null;
  const timeZone = typeof body?.timeZone === "string" ? body.timeZone.slice(0, 64) : undefined;
  const result = await orders.placeBookOrderWithCredits({
    userId: auth.user.id,
    orderId: id,
  });

  if (result.error?.code === "NOT_FOUND") {
    return jsonError(result.error.message, 404, result.error.code);
  }
  if (result.error?.code === "INVALID_STATE") {
    return jsonError(result.error.message, 409, result.error.code);
  }
  if (result.error?.code === "INSUFFICIENT_CREDITS") {
    return jsonError(result.error.message, 402, result.error.code);
  }
  if (result.data) {
    // Payment confirmed: the server copy of `purchase`, deduplicated with the browser's by order id.
    after(() => trackPurchaseServer({ request, orderId: id, email: auth.user.email }));
    // Hand the paid order to Lulu after the response (failures are recorded on the order, never
    // thrown), then email the customer, so the email can carry Lulu's own cancel deadline.
    after(async () => {
      await orders.submitOrderToLulu(id);
      await orders.sendOrderConfirmationEmail(id, { timeZone });
    });
  }
  return jsonResult(result, result.error ? 500 : 200);
}
