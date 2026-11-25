import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { PACKAGE_PRICE_CHANGED_CODE, PACKAGE_UNAVAILABLE_CODE, isBookBindingId } from "@/lib/bookPackages/types";
import { createPackageCheckout } from "@/server/bookPackagesService";
import { stripeConfigured } from "@/server/stripe/config";

const STATUS_BY_CODE: Record<string, number> = {
  [PACKAGE_UNAVAILABLE_CODE]: 404,
  [PACKAGE_PRICE_CHANGED_CODE]: 409,
};

/** Start a Stripe Checkout for a package. The amount comes from the server's catalog. */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  if (!stripeConfigured()) {
    return jsonError("Card payments are not available yet", 503, "STRIPE_NOT_CONFIGURED");
  }

  const body = (await request.json().catch(() => ({}))) as {
    bindingId?: unknown;
    albumName?: unknown;
    expectedPriceCents?: unknown;
  };
  if (!isBookBindingId(body.bindingId)) return jsonError("Pick a book.", 400);
  const expected = typeof body.expectedPriceCents === "number" && Number.isInteger(body.expectedPriceCents)
    ? body.expectedPriceCents
    : null;

  const result = await createPackageCheckout({
    userId: auth.user.id,
    email: auth.user.email,
    bindingId: body.bindingId,
    albumName: typeof body.albumName === "string" ? body.albumName : null,
    expectedPriceCents: expected,
  });
  return jsonResult(result, result.error ? (STATUS_BY_CODE[result.error.code ?? ""] ?? 500) : 200);
}
