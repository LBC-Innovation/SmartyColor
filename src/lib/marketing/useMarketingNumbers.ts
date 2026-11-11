"use client";

import { useEffect, useState } from "react";
import type { NumbersInput } from "@/lib/marketing/copy";

export type MarketingNumbers = NumbersInput;

let cached: Promise<MarketingNumbers | null> | null = null;

function load(): Promise<MarketingNumbers | null> {
  // A failed request is not kept: the next mount tries again.
  cached ??= fetch("/api/marketing/numbers")
    .then((r) => {
      if (!r.ok) throw new Error(`numbers ${r.status}`);
      return r.json() as Promise<{ data?: MarketingNumbers }>;
    })
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
