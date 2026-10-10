/** All wallet amounts are integer USD cents unless noted. */

export function formatCredits(cents: number, options?: { compact?: boolean }): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  if (options?.compact && Math.abs(safe) >= 100_00) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(safe / 100);
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(safe / 100);
}

export function parseDollarsToCents(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, "");
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const normalized = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ""] = normalized.split(".");
  const centsPart = (frac + "00").slice(0, 2);
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt(centsPart, 10);
  if (!Number.isFinite(cents)) return null;
  const total = negative ? -cents : cents;
  return total;
}

export function dollarsInputToCents(input: string): number | null {
  return parseDollarsToCents(input);
}
