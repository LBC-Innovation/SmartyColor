export type CreditLedgerEntry = {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
};

/** Promotional credit settings, edited in the admin panel. */
export type PromoCreditSettings = {
  /** Gifted once when an account's email is first confirmed; 0 turns the gift off. */
  welcomeCreditCents: number;
  updatedAt: string;
};

export const MAX_WELCOME_CREDIT_CENTS = 500_00;

/** Query flag Stripe Checkout returns with: `success` or `canceled`. */
export const CREDITS_RETURN_PARAM = "credits";
/** Query param carrying the Stripe Checkout Session id on a successful return. */
export const CHECKOUT_SESSION_PARAM = "session_id";

/**
 * Outcome of checking a returned checkout with Stripe.
 * `pending` is a payment Stripe accepted but has not collected yet (bank debits
 * take days); the credit lands when Stripe reports it paid.
 */
export type CreditTopUpConfirmation =
  | { status: "credited"; amountCents: number; creditsBalanceCents: number }
  | { status: "pending"; amountCents: number };
