import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { normalizeShippingAddress, validateShippingAddress } from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";
import * as orders from "@/server/ordersService";

type Params = { params: Promise<{ id: string }> };

/** Update the shipping address on a draft or not-yet-paid order. */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as { shippingAddress?: Partial<ShippingAddress> };
  const address = normalizeShippingAddress(body.shippingAddress);
  const errors = validateShippingAddress(address);
  if (Object.keys(errors).length > 0) {
    return jsonError("Please complete the shipping address.", 400, "ADDRESS_INVALID");
  }

  const result = await orders.updateOrderShippingAddress({
    userId: auth.user.id,
    orderId: id,
    shippingAddress: address,
  });
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, result.error.code);
  if (result.error?.code === "INVALID_STATE") return jsonError(result.error.message, 409, result.error.code);
  return jsonResult(result, result.error ? 500 : 200);
}
