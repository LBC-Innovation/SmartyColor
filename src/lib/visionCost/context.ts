import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped context so usage/error events can be attributed to a user (or, for people who
 * are not signed in, to their address and rough location) without threading ids through every
 * AI helper.
 */

/** Where a guest's request came from, as the hosting platform reported it. */
export type VisionGuest = {
  /** The guest-limit key: an IPv4 address, or "v6/<first four groups>" for IPv6. */
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  postal: string | null;
  latitude: number | null;
  longitude: number | null;
};

type VisionContext = { userId: string | null; guest?: VisionGuest | null };

const storage = new AsyncLocalStorage<VisionContext>();

export function withVisionUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  return storage.run({ userId }, fn);
}

export function withVisionGuest<T>(guest: VisionGuest | null, fn: () => Promise<T>): Promise<T> {
  return storage.run({ userId: null, guest }, fn);
}

export function currentVisionUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}

export function currentVisionGuest(): VisionGuest | null {
  return storage.getStore()?.guest ?? null;
}
