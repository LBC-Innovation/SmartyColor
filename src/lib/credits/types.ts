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
