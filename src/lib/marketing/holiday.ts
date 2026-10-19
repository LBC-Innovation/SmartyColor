/**
 * The Christmas order-by date, from NEXT_PUBLIC_HOLIDAY_ORDER_BY (YYYY-MM-DD). Empty or unset turns
 * every "Order by" line off. Lines show through the end of that day in US Pacific time, so they
 * disappear on their own the day after.
 */
const ZONE = "America/Los_Angeles";

export type HolidayOrderBy = { iso: string; label: string };

function todayIn(zone: string, now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function holidayOrderBy(now: Date = new Date()): HolidayOrderBy | null {
  const iso = process.env.NEXT_PUBLIC_HOLIDAY_ORDER_BY?.trim();
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  if (todayIn(ZONE, now) > iso) return null;
  const label = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
  return { iso, label };
}
