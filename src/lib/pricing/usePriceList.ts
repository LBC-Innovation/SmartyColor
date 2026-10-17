"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ApiResult } from "@/lib/api/types";
import type { PublicPriceList } from "@/lib/pricing/types";

/**
 * The customer price list, fetched once per page load and shared by every
 * component. Null until it arrives (or if it can't be loaded): callers then
 * leave the decision to the server, which always charges the catalog price.
 */
let prices: PublicPriceList | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Fetch the price list again, e.g. after an admin changes a price. */
export function refreshPriceList(): Promise<void> {
  inflight = fetch("/api/pricing", { cache: "no-store" })
    .then((res) => res.json() as Promise<ApiResult<PublicPriceList>>)
    .then((result) => {
      if (result.data) {
        prices = result.data;
        emit();
      }
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePriceList(): PublicPriceList | null {
  const value = useSyncExternalStore(
    subscribe,
    () => prices,
    () => null,
  );
  useEffect(() => {
    if (!prices && !inflight) void refreshPriceList();
  }, []);
  return value;
}
