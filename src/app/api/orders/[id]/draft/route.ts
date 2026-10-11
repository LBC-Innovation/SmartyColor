import { jsonError, jsonResult } from "@/lib/api/respond";
import { getBookBinding, type BookBindingId } from "@/lib/print/bookBindings";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as orders from "@/server/ordersService";
import { normalizeShippingAddress } from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as {
    bindingId?: BookBindingId;
    pageCount?: number;
    projectTitle?: string;
    estimatedTotalCents?: number | null;
    shippingPostcode?: string | null;
    shippingAddress?: Partial<ShippingAddress> | null;
  };

  if (body.bindingId !== "perfect_bound" && body.bindingId !== "saddle_stitch") {
    return jsonError("bindingId is required", 400);
  }
  if (typeof body.pageCount !== "number" || body.pageCount < 1) {
    return jsonError("pageCount is required", 400);
  }

  const binding = getBookBinding(body.bindingId);
  const result = await orders.updateDraftBookOrder({
    userId: auth.user.id,
    orderId: id,
    productId: binding.productId,
    pageCount: body.pageCount,
    projectTitle: body.projectTitle?.trim() || "My coloring book",
    luluCostCents: body.estimatedTotalCents ?? null,
    totalCents: body.estimatedTotalCents ?? null,
    shippingPostcode: body.shippingPostcode ?? null,
    shippingAddress: body.shippingAddress ? normalizeShippingAddress(body.shippingAddress) : null,
  });

  if (result.error?.code === "NOT_FOUND") {
    return jsonError(result.error.message, 404, result.error.code);
  }
  if (result.error?.code === "INVALID_STATE") {
    return jsonError(result.error.message, 409, result.error.code);
  }
  return jsonResult(result, result.error ? 500 : 200);
}
