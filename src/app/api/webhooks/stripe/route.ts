import Stripe from "stripe";
import { jsonError, jsonResult } from "@/lib/api/respond";
import { getStripe } from "@/server/stripe/client";
import { stripeWebhookSecret } from "@/server/stripe/config";
import { fulfillCreditTopUpFromCheckoutSession } from "@/server/stripe/creditCheckout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = stripeWebhookSecret();
  if (!secret) {
    return jsonError("Stripe webhook is not configured", 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonError("Missing Stripe signature", 400);
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid signature";
    return jsonError(message, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const result = await fulfillCreditTopUpFromCheckoutSession({
      id: session.id,
      metadata: session.metadata,
      payment_status: session.payment_status,
    });
    if (result.error) {
      return jsonError(result.error.message, 500);
    }
    return jsonResult({ data: result.data, error: null }, 200);
  }

  return jsonResult({ data: { ignored: true }, error: null }, 200);
}
