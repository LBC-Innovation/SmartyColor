import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { stripeConfigured } from "@/server/stripe/config";
import { createCreditTopUpCheckout } from "@/server/stripe/creditCheckout";

export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  if (!stripeConfigured()) {
    return jsonError("Credit purchases are not available yet", 503, "STRIPE_NOT_CONFIGURED");
  }

  const body = (await request.json()) as {
    amountCents?: number;
    returnPath?: string;
  };

  if (typeof body.amountCents !== "number" || !Number.isInteger(body.amountCents)) {
    return jsonError("amountCents is required", 400);
  }

  const returnPath =
    typeof body.returnPath === "string" && body.returnPath.trim()
      ? body.returnPath.trim()
      : "/orders";

  const result = await createCreditTopUpCheckout({
    userId: auth.user.id,
    email: auth.user.email,
    amountCents: body.amountCents,
    returnPath,
  });

  return jsonResult(result, result.error ? 400 : 200);
}
