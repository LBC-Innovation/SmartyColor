"use client";

import { useEffect, useState } from "react";

export type MarketingNumbers = { referencePriceCents: number | null; welcomeCreditCents: number | null };

let cached: Promise<MarketingNumbers | null> | null = null;

function load(): Promise<MarketingNumbers | null> {
  cached ??= fetch("/api/marketing/numbers")
    .then((r) => (r.ok ? (r.json() as Promise<{ data?: MarketingNumbers }>) : null))
    .then((body) => body?.data ?? null)
    .catch(() => {
      cached = null;
      return null;
    });
  return cached;
}

/** The reference book price and sign-up credit from the server, or null until known (or if unavailable). */
export function useMarketingNumbers(enabled = true): MarketingNumbers | null {
  const [numbers, setNumbers] = useState<MarketingNumbers | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void load().then((n) => {
      if (!cancelled) setNumbers(n);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return numbers;
}
