/**
 * The `next` query param on sign-in and sign-up: where to go once the person is signed in.
 * It must be a path on this site, never another address.
 */

const DUMMY_ORIGIN = "http://next-path.invalid";

/**
 * The path (with query and hash) if it is safe to navigate to, or null.
 * Rejects anything with whitespace or control characters (browsers strip tabs and newlines, so
 * "/\t/evil.com" would become "//evil.com"), anything not starting with a single "/", backslashes,
 * and anything that does not resolve to the same origin. Returns the re-serialised URL, not the input.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (typeof next !== "string" || next === "") return null;
  if (/[\x00-\x20\x7f]/.test(next)) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  try {
    const url = new URL(next, DUMMY_ORIGIN);
    if (url.origin !== DUMMY_ORIGIN) return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    // A re-serialised path that begins "//" would be read as another host.
    return path.startsWith("//") ? null : path;
  } catch {
    return null;
  }
}

/** `/sign-in` or `/sign-up` (or any auth page) with `next` carried along when it is safe. */
export function withNextParam(href: string, next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe ? `${href}?next=${encodeURIComponent(safe)}` : href;
}
