import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { stripeConfigured } from "@/server/stripe/config";
import { confirmCreditTopUp } from "@/server/stripe/creditCheckout";

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  NOT_PAID: 409,
  UNAVAILABLE: 502,
};

/** Back from Stripe Checkout: verify the payment with Stripe and credit the wallet. */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  if (!stripeConfigured()) {
    return jsonError("Credit purchases are not available yet", 503, "STRIPE_NOT_CONFIGURED");
  }

  let body: { sessionId?: unknown };
  try {
    body = (await request.json()) as { sessionId?: unknown };
  } catch {
    return jsonError("sessionId is required", 400);
  }
  if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return jsonError("sessionId is required", 400);
  }

  const result = await confirmCreditTopUp({
    userId: auth.user.id,
    sessionId: body.sessionId.trim(),
  });

  return jsonResult(result, result.error ? (STATUS_BY_CODE[result.error.code ?? ""] ?? 500) : 200);
}
