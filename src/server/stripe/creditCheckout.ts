import type { ApiResult } from "@/lib/api/types";
import { appOrigin } from "@/server/stripe/config";
import { getStripe } from "@/server/stripe/client";
import { getSupabaseAdmin } from "@/lib/supabase/service";

const MIN_TOP_UP_CENTS = 50;
const MAX_TOP_UP_CENTS = 500_00;

export async function createCreditTopUpCheckout(input: {
  userId: string;
  email: string;
  amountCents: number;
  returnPath: string;
}): Promise<ApiResult<{ checkoutUrl: string }>> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_TOP_UP_CENTS) {
    return {
      data: null,
      error: { message: `Minimum top-up is $${(MIN_TOP_UP_CENTS / 100).toFixed(2)}` },
    };
  }
  if (input.amountCents > MAX_TOP_UP_CENTS) {
    return {
      data: null,
      error: { message: `Maximum top-up is $${(MAX_TOP_UP_CENTS / 100).toFixed(2)}` },
    };
  }

  const returnPath = input.returnPath.startsWith("/") ? input.returnPath : `/${input.returnPath}`;
  const origin = appOrigin();
  const successUrl = `${origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}credits=success`;
  const cancelUrl = `${origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}credits=canceled`;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: input.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: input.amountCents,
            product_data: {
              name: "Colorful Memories print credits",
              description: "Promo wallet balance applied toward book orders",
            },
          },
        },
      ],
      metadata: {
        purpose: "credit_topup",
        userId: input.userId,
        amountCents: String(input.amountCents),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      return { data: null, error: { message: "Stripe did not return a checkout URL" } };
    }

    return { data: { checkoutUrl: session.url }, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not start checkout";
    return { data: null, error: { message } };
  }
}

export async function fulfillCreditTopUpFromCheckoutSession(
  session: { id: string; metadata?: Record<string, string> | null; payment_status?: string },
): Promise<ApiResult<{ creditsBalanceCents: number; alreadyFulfilled: boolean }>> {
  if (session.payment_status && session.payment_status !== "paid") {
    return { data: null, error: { message: "Checkout session is not paid" } };
  }

  const purpose = session.metadata?.purpose;
  const userId = session.metadata?.userId;
  const amountRaw = session.metadata?.amountCents;
  const amountCents = amountRaw ? Number.parseInt(amountRaw, 10) : NaN;

  if (purpose !== "credit_topup" || !userId || !Number.isInteger(amountCents) || amountCents <= 0) {
    return { data: null, error: { message: "Invalid checkout session metadata" } };
  }

  const { data: existing } = await getSupabaseAdmin()
    .from("credit_stripe_sessions")
    .select("stripe_checkout_session_id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  const alreadyFulfilled = Boolean(existing);

  const { data, error } = await getSupabaseAdmin().rpc("grant_purchased_credits", {
    p_user_id: userId,
    p_delta: amountCents,
    p_stripe_session_id: session.id,
    p_note: "Stripe credit purchase",
  });

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const creditsBalanceCents = typeof data === "number" ? data : Number(data);

  return {
    data: {
      creditsBalanceCents,
      alreadyFulfilled,
    },
    error: null,
  };
}
