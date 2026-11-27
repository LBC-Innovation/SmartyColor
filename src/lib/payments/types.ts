/**
 * One customer's money in one list: wallet changes and card charges together, each tagged by
 * where the money moved. Built by src/server/adminPaymentsService.ts for the admin drawer.
 */

/** Where the money moved: through the wallet, or straight on a card. */
export type PaymentChannel = "wallet" | "card";

export type PaymentKind =
  /** Card charge that funded the wallet (Stripe top-up). */
  | "topup"
  /** Card charge that paid for something directly (a book package bought by card). */
  | "card_purchase"
  /** Money sent back to a card. */
  | "card_refund"
  /** Wallet paid for a book, package or download. */
  | "purchase"
  /** Wallet paid for pages, touch-ups or portraits as they were made. */
  | "usage"
  /** A purchase given back to the wallet (canceled order or package, failed page). */
  | "refund"
  /** Free credit: admin grant, sign-up gift, friend credit. */
  | "grant"
  /** Credit taken off by an admin, or a failed card refund being undone. */
  | "adjustment";

/** A card charge, with what has been refunded from it so far. */
export type CardChargeInfo = {
  sessionId: string;
  source: "wallet_topup" | "book_package";
  chargedCents: number;
  /** Refunded through the admin (pending refunds count, so they can't be issued twice). */
  refundedCents: number;
  /** What can still go back to the card: the charge less refunds, and for a top-up no more than the wallet holds. */
  refundableCents: number;
};

/** The book package a line bought, however it was paid. */
export type PackageInfo = {
  id: string;
  status: "active" | "void";
  paidWith: "card" | "credit";
  /** Can be canceled now: not used for a book yet, not already refunded. */
  cancelable: boolean;
  /** What canceling returns under the customer's own rule: price less pages made (and less card refunds). */
  refundQuoteCents: number | null;
};

export type PaymentEntry = {
  /** Stable id: `ledger:<uuid>`, `card:<checkout session id>` or `refund:<uuid>`. */
  id: string;
  at: string;
  channel: PaymentChannel;
  kind: PaymentKind;
  /** Plain-language line, e.g. "Book package (stapled)". */
  label: string;
  /** Detail: the admin's note, the album, the refund reason. */
  note: string | null;
  /** The customer's view of it: negative when they paid, positive when money came back to them. */
  amountCents: number;
  /** Wallet change, when the wallet moved (a top-up moves both the card and the wallet). */
  walletDeltaCents: number | null;
  walletBalanceAfterCents: number | null;
  /** Card charges (top-ups and card purchases). */
  card?: CardChargeInfo;
  package?: PackageInfo;
  /** Card refunds: where the refund stands with Stripe. */
  refundStatus?: "pending" | "succeeded" | "failed";
  refundError?: string | null;
  /** A receipt email can be sent for this line. */
  receiptable: boolean;
};

export type PaymentTotals = {
  /** Everything charged to their card: top-ups and direct card purchases. */
  cardChargedCents: number;
  /** Sent back to their card. */
  cardRefundedCents: number;
  /** What they have really paid us: card charged less card refunds. */
  cardNetCents: number;
  /** Bought with the wallet or a card, less refunds of those purchases. */
  spentCents: number;
  /** Free credit given: admin grants, sign-up gift, friend credit (less removals). */
  grantedCents: number;
};

export type UserPayments = {
  balanceCents: number;
  totals: PaymentTotals;
  /** Newest first. */
  entries: PaymentEntry[];
};

/** Live card details from Stripe, fetched when a card line is opened. */
export type CardChargeDetails = {
  paymentIntentId: string | null;
  brand: string | null;
  last4: string | null;
  /** Stripe's own hosted receipt for the charge. */
  stripeReceiptUrl: string | null;
  /** Refunded according to Stripe, including refunds made in the Stripe dashboard. */
  stripeRefundedCents: number;
  dashboardUrl: string | null;
  livemode: boolean;
};

export type CardRefundRequest = {
  sessionId: string;
  amountCents: number;
  /** Book packages: void the package as well. */
  cancelPackage?: boolean;
  note?: string;
  /** Email the customer a refund receipt once Stripe accepts it. */
  notifyUser?: boolean;
};

export type CardRefundResult = {
  refundId: string;
  status: "succeeded" | "pending" | "failed";
  amountCents: number;
  creditsBalanceCents: number | null;
  emailSent?: boolean;
};
