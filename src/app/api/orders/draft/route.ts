import { jsonError, jsonResult } from "@/lib/api/respond";
import { getBookBinding, isPrintBindingId } from "@/lib/print/bookBindings";
import { normalizeCoverDesign } from "@/lib/print/bookCover";
import { parsePrintPages } from "@/server/printBookService";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as orders from "@/server/ordersService";
import { normalizeShippingAddress, validateBillingAddress } from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";
import { attributionFromRequest } from "@/lib/marketing/attribution";
import { saveAttribution } from "@/server/marketing/attributionService";

export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as {
    bindingId?: string;
    pageCount?: number;
    photoCount?: number;
    blankCount?: number;
    projectTitle?: string;
    shippingPostcode?: string | null;
    shippingAddress?: Partial<ShippingAddress> | null;
    billingAddress?: Partial<ShippingAddress> | null;
    pages?: unknown;
    coverDesign?: unknown;
    proofConfirmed?: boolean;
  };

  if (!isPrintBindingId(body.bindingId)) {
    return jsonError("bindingId is required", 400);
  }
  if (typeof body.pageCount !== "number" || body.pageCount < 1) {
    return jsonError("pageCount is required", 400);
  }

  const binding = getBookBinding(body.bindingId);
  const pages = parsePrintPages(body.pages, body.bindingId);
  if (pages.error) return jsonError(pages.error.message, 400, pages.error.code);
  if (pages.data!.length !== body.pageCount) {
    return jsonError("pageCount does not match the pages sent", 400, "INVALID_PAGES");
  }
  if (!body.coverDesign || typeof body.coverDesign !== "object") {
    return jsonError("Design a cover for the book first.", 400, "COVER_REQUIRED");
  }
  if (body.billingAddress && Object.keys(validateBillingAddress(body.billingAddress)).length > 0) {
    return jsonError("Please complete the billing address.", 400, "ADDRESS_INVALID");
  }
  const result = await orders.createDraftBookOrder({
    userId: auth.user.id,
    contactEmail: auth.user.email,
    productId: binding.productId,
    pageCount: body.pageCount,
    projectTitle: body.projectTitle?.trim() || "My coloring book",
    shippingPostcode: body.shippingPostcode ?? null,
    shippingAddress: body.shippingAddress ? normalizeShippingAddress(body.shippingAddress) : null,
    billingAddress: body.billingAddress ? normalizeShippingAddress(body.billingAddress) : null,
    printPages: pages.data,
    coverDesign: normalizeCoverDesign(body.coverDesign),
    proofConfirmed: body.proofConfirmed === true,
  });

  if (result.error?.code === "NOT_FOUND") {
    return jsonError(result.error.message, 404);
  }
  if (result.data) await saveAttribution("book_orders", result.data.orderId, attributionFromRequest(request));
  return jsonResult(result, result.error ? 500 : 201);
}
