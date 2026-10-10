import { jsonError, jsonResult } from "@/lib/api/respond";
import { getBookBinding, type BookBindingId } from "@/lib/print/bookBindings";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as orders from "@/server/ordersService";

export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as {
    bindingId?: BookBindingId;
    pageCount?: number;
    photoCount?: number;
    blankCount?: number;
    projectTitle?: string;
    estimatedTotalCents?: number | null;
    shippingPostcode?: string | null;
  };

  if (body.bindingId !== "perfect_bound" && body.bindingId !== "saddle_stitch") {
    return jsonError("bindingId is required", 400);
  }
  if (typeof body.pageCount !== "number" || body.pageCount < 1) {
    return jsonError("pageCount is required", 400);
  }

  const binding = getBookBinding(body.bindingId);
  const result = await orders.createDraftBookOrder({
    userId: auth.user.id,
    contactEmail: auth.user.email,
    productId: binding.productId,
    pageCount: body.pageCount,
    projectTitle: body.projectTitle?.trim() || "My coloring book",
    luluCostCents: body.estimatedTotalCents ?? null,
    totalCents: body.estimatedTotalCents ?? null,
    shippingPostcode: body.shippingPostcode ?? null,
  });

  if (result.error?.code === "NOT_FOUND") {
    return jsonError(result.error.message, 404);
  }
  return jsonResult(result, result.error ? 500 : 201);
}
