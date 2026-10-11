import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped context so usage/error events can be attributed to a user
 * without threading ids through every AI helper.
 */
type VisionContext = { userId: string | null };

const storage = new AsyncLocalStorage<VisionContext>();

export function withVisionUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  return storage.run({ userId }, fn);
}

export function currentVisionUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}
