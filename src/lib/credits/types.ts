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
  /** Share with a friend: given to the new account when it signs up through a friend's link; 0 turns it off. */
  friendCreditCents: number;
  /** Share with a friend: given to the account that shared, when its friend signs up; 0 turns it off. */
  sharerCreditCents: number;
  updatedAt: string;
};

/** An account's Share with a friend link and how it has done. */
export type ReferralSummary = {
  code: string;
  /** The friend landing page (/friend/CODE, with ?ref= and campaign tags), to share. */
  url: string;
  /** The same link tagged for the QR code, so scans are counted apart from taps. */
  qrUrl: string;
  /** The name the friend sees ("Zach shared…"). */
  sharerName: string;
  /** What the friend gets when they sign up. */
  friendCreditCents: number;
  /** What the sharer gets when a friend signs up. */
  sharerCreditCents: number;
  /** Friends whose sign-up earned a credit. */
  referredCount: number;
  earnedCents: number;
};

/** What the friend landing page shows. */
export type FriendInvite = {
  code: string;
  sharerName: string;
  friendCreditCents: number;
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
