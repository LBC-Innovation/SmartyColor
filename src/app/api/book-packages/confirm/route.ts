import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { confirmPackageCheckout } from "@/server/bookPackagesService";
import { stripeConfigured } from "@/server/stripe/config";

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  NOT_PAID: 409,
  EXPIRED: 410,
  UNAVAILABLE: 502,
};

/**
 * Back from Stripe Checkout: verify the payment with Stripe and make the package. Safe to call
 * any number of times; the database makes one package per checkout.
 */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  if (!stripeConfigured()) {
    return jsonError("Card payments are not available yet", 503, "STRIPE_NOT_CONFIGURED");
  }

  const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
  if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return jsonError("sessionId is required", 400);
  }

  const result = await confirmPackageCheckout({ userId: auth.user.id, sessionId: body.sessionId.trim() });
  return jsonResult(result, result.error ? (STATUS_BY_CODE[result.error.code ?? ""] ?? 500) : 200);
}
