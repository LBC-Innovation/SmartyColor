/** The printer's estimated delivery window for a book, as calendar dates (YYYY-MM-DD). */
export type DeliveryEstimate = {
  min: string | null;
  max: string | null;
};

/**
 * A calendar date for people to read, e.g. "Nov 27". Lulu sends plain dates ("2026-11-27"), which
 * `new Date()` would read as midnight UTC and show as the day before in US time zones, so a plain
 * date is built from its parts in local time.
 */
export function formatDeliveryDay(value: string): string {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Nov 27 – Dec 2", one date when both ends match or only one is known, or "" with neither. */
export function formatDeliveryRange(estimate: DeliveryEstimate | null | undefined): string {
  const from = estimate?.min ? formatDeliveryDay(estimate.min) : "";
  const to = estimate?.max ? formatDeliveryDay(estimate.max) : "";
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to;
}
