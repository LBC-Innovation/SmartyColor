import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { PACKAGE_SHIPPING_UNAVAILABLE_CODE, PACKAGE_UNAVAILABLE_CODE, isBookBindingId } from "@/lib/bookPackages/types";
import type { ShippingAddress } from "@/lib/orders/types";
import { quotePackageShipping } from "@/server/bookPackagesService";

const STATUS_BY_CODE: Record<string, number> = {
  [PACKAGE_UNAVAILABLE_CODE]: 404,
  [PACKAGE_SHIPPING_UNAVAILABLE_CODE]: 502,
  INVALID_ADDRESS: 400,
};

/** Standard shipping for a package's book to an address, to pay with the package. */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { bindingId?: unknown; address?: unknown };
  if (!isBookBindingId(body.bindingId)) return jsonError("Pick a book.", 400);
  const address = body.address && typeof body.address === "object" ? (body.address as Partial<ShippingAddress>) : null;

  const result = await quotePackageShipping({ bindingId: body.bindingId, address });
  return jsonResult(result, result.error ? (STATUS_BY_CODE[result.error.code ?? ""] ?? 500) : 200);
}
