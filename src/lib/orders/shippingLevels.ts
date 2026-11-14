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

/** Speeds expected to arrive sooner than the chosen one (by their latest date, then earliest). */
export function fasterShippingChoices(choices: ShippingChoice[], level: string): ShippingChoice[] {
  const current = choices.find((c) => c.level === level);
  const currentEnd = current?.deliveryMax ?? current?.deliveryMin;
  if (!currentEnd) return [];
  return choices.filter((c) => {
    if (c.level === level) return false;
    const end = c.deliveryMax ?? c.deliveryMin;
    return Boolean(end && end < currentEnd);
  });
}

/** "get it faster via 2 other options" */
export function fasterShippingPrompt(count: number): string {
  return `get it faster via ${count} other ${count === 1 ? "option" : "options"}`;
}

/**
 * Scrolls the visible "Shipping speed" picker into view once it has been drawn (the Ship to step
 * may only just be opening, or the phone sheet sliding up).
 */
export function scrollToShippingSpeeds(delayMs = 0): void {
  window.setTimeout(() => {
    requestAnimationFrame(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>("[data-shipping-speed]")).find(
        (el) => el.offsetParent !== null,
      );
      if (!target) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      target.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
    });
  }, delayMs);
}
