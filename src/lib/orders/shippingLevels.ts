/**
 * Lulu's shipping levels a printed book can be sent with. MAIL is the cheapest and slowest and is
 * what every order used before customers could choose; it stays the default.
 */
export const SHIPPING_LEVELS = ["MAIL", "PRIORITY_MAIL", "GROUND_HD", "GROUND", "EXPEDITED", "EXPRESS"] as const;
export type ShippingLevel = (typeof SHIPPING_LEVELS)[number];

export const DEFAULT_SHIPPING_LEVEL: ShippingLevel = "MAIL";

export function isShippingLevel(value: unknown): value is ShippingLevel {
  return typeof value === "string" && (SHIPPING_LEVELS as readonly string[]).includes(value);
}

/** What customers call each level. Lulu's carrier name is shown beside it. */
export const SHIPPING_LEVEL_LABELS: Record<ShippingLevel, string> = {
  MAIL: "Standard",
  PRIORITY_MAIL: "Priority",
  GROUND_HD: "Ground",
  GROUND: "Ground",
  EXPEDITED: "Expedited",
  EXPRESS: "Express",
};

export function shippingLevelLabel(level: string | null | undefined): string {
  return isShippingLevel(level) ? SHIPPING_LEVEL_LABELS[level] : "Standard";
}

/** One way to ship this book to this address, as the quote returns it. */
export type ShippingChoice = {
  level: ShippingLevel;
  /** e.g. "Expedited" */
  label: string;
  /** The carrier service Lulu named, e.g. "FedEx 2 Day". */
  service: string | null;
  /** The printer's shipping cost before tax, in cents; used to show the difference between choices. */
  costCents: number | null;
  /** Estimated delivery window (YYYY-MM-DD), printing time included. */
  deliveryMin: string | null;
  deliveryMax: string | null;
};
