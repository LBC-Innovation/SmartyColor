import type Stripe from "stripe";
import type { ApiResult } from "@/lib/api/types";
import {
  CHECKOUT_SESSION_PARAM,
  CREDITS_RETURN_PARAM,
  type CreditTopUpConfirmation,
} from "@/lib/credits/types";
import { appOrigin } from "@/server/stripe/config";
import { getStripe } from "@/server/stripe/client";
import { getSupabaseAdmin } from "@/lib/supabase/service";

const MIN_TOP_UP_CENTS = 50;
const MAX_TOP_UP_CENTS = 500_00;
const CHECKOUT_SESSION_ID_RE = /^cs_[A-Za-z0-9_]{8,250}$/;
const PG_UNIQUE_VIOLATION = "23505";

/** The checkout is not one of our top-ups; nothing to do with it. */
export const NOT_CREDIT_TOPUP_CODE = "NOT_CREDIT_TOPUP";
/** Stripe has the checkout but has not collected the money yet. */
export const PAYMENT_PENDING_CODE = "PAYMENT_PENDING";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

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
  const returnUrl = `${appOrigin()}${returnPath}${returnPath.includes("?") ? "&" : "?"}${CREDITS_RETURN_PARAM}`;
  // Stripe swaps the {CHECKOUT_SESSION_ID} placeholder for the real id, which is
  // what lets the page we land on confirm the payment without waiting on the webhook.
  const successUrl = `${returnUrl}=success&${CHECKOUT_SESSION_PARAM}={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${returnUrl}=canceled`;

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

type CheckoutSessionLike = {
  id: string;
  metadata?: Record<string, string> | null;
  payment_status?: string;
};

/** Who a top-up checkout is for and how much, or null when it is not one of ours. */
function readTopUpMetadata(
  session: CheckoutSessionLike,
): { userId: string | null; amountCents: number } | null {
  if (session.metadata?.purpose !== "credit_topup") return null;
  const amountRaw = session.metadata.amountCents;
  return {
    userId: session.metadata.userId || null,
    amountCents: amountRaw ? Number.parseInt(amountRaw, 10) : NaN,
  };
}

/**
 * Credit the wallet for a paid top-up checkout. Safe to call more than once and
 * from more than one place (the webhook and the return page both do): a checkout
 * is only ever credited once.
 */
export async function fulfillCreditTopUpFromCheckoutSession(
  session: CheckoutSessionLike,
): Promise<ApiResult<{ creditsBalanceCents: number; amountCents: number; alreadyFulfilled: boolean }>> {
  const topUp = readTopUpMetadata(session);
  if (!topUp) {
    return {
      data: null,
      error: { message: "Checkout session is not a credit top-up", code: NOT_CREDIT_TOPUP_CODE },
    };
  }
  const { userId, amountCents } = topUp;
  if (!userId || !Number.isInteger(amountCents) || amountCents <= 0) {
    return { data: null, error: { message: "Invalid checkout session metadata" } };
  }
  if (session.payment_status && session.payment_status !== "paid") {
    return { data: null, error: { message: "Checkout session is not paid", code: PAYMENT_PENDING_CODE } };
  }

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("credit_stripe_sessions")
    .select("stripe_checkout_session_id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  let alreadyFulfilled = Boolean(existing);

  const { data, error } = await admin.rpc("grant_purchased_credits", {
    p_user_id: userId,
    p_delta: amountCents,
    p_stripe_session_id: session.id,
    p_note: "Stripe credit purchase",
  });

  let creditsBalanceCents: number;
  if (!error) {
    creditsBalanceCents = typeof data === "number" ? data : Number(data);
  } else if (error.code === PG_UNIQUE_VIOLATION) {
    // The webhook and the return page raced; the other one credited this checkout
    // and the database refused the second grant. Report the balance as it stands.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("credits_balance")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !profile) {
      return { data: null, error: { message: profileError?.message ?? "Profile not found" } };
    }
    creditsBalanceCents = profile.credits_balance as number;
    alreadyFulfilled = true;
  } else {
    log("error", "Credit top-up could not be granted", {
      userId,
      stripeCheckoutSessionId: session.id,
      error: error.message,
    });
    return { data: null, error: { message: error.message } };
  }

  if (!alreadyFulfilled) {
    log("info", "Credit top-up granted", {
      userId,
      stripeCheckoutSessionId: session.id,
      amountCents,
      creditsBalanceCents,
    });
  }

  return { data: { creditsBalanceCents, amountCents, alreadyFulfilled }, error: null };
}

/**
 * Called by the page Stripe sends the user back to. Asks Stripe what happened to
 * the checkout and credits the wallet if it was paid, so the balance is right the
 * moment the user lands, whether or not the webhook has arrived (or is set up).
 */
export async function confirmCreditTopUp(input: {
  userId: string;
  sessionId: string;
}): Promise<ApiResult<CreditTopUpConfirmation>> {
  const notFound = {
    data: null,
    error: { message: "We could not find that payment", code: "NOT_FOUND" },
  } as const;
  if (!CHECKOUT_SESSION_ID_RE.test(input.sessionId)) return notFound;

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(input.sessionId);
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "resource_missing") return notFound;
    log("error", "Stripe checkout lookup failed", {
      userId: input.userId,
      stripeCheckoutSessionId: input.sessionId,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      data: null,
      error: { message: "Could not reach Stripe to confirm the payment", code: "UNAVAILABLE" },
    };
  }

  // Someone else's checkout looks the same as one that does not exist.
  const topUp = readTopUpMetadata(session);
  if (!topUp || topUp.userId !== input.userId) return notFound;

  if (session.status !== "complete") {
    return { data: null, error: { message: "That payment was not completed", code: "NOT_PAID" } };
  }

  const result = await fulfillCreditTopUpFromCheckoutSession({
    id: session.id,
    metadata: session.metadata,
    payment_status: session.payment_status,
  });
  if (result.error) {
    if (result.error.code === PAYMENT_PENDING_CODE) {
      return { data: { status: "pending", amountCents: topUp.amountCents }, error: null };
    }
    return { data: null, error: result.error };
  }

  return {
    data: {
      status: "credited",
      amountCents: result.data.amountCents,
      creditsBalanceCents: result.data.creditsBalanceCents,
    },
    error: null,
  };
}
