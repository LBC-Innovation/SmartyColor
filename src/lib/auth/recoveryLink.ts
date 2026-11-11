/**
 * What the emailed "reset password" link puts in the address bar. The auth client uses Supabase's
 * implicit flow, so a good link arrives as `#access_token=…&type=recovery` and a bad one as
 * `#error=access_denied&error_code=otp_expired…` (some setups use the query string instead).
 * A `?code=` or `token_hash` is not something this configuration produces, so it counts as invalid.
 */

export type RecoveryLink =
  | { status: "ready"; accessToken: string }
  | { status: "invalid"; reason: "expired" | "missing" };

/** Remembered per address, so a second link opened in the same tab is read afresh. */
let cached: { key: string; link: RecoveryLink } | undefined;

function parse(location: Location): RecoveryLink {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(location.search);
  const get = (key: string) => hash.get(key) ?? query.get(key);

  if (get("error") || get("error_code")) return { status: "invalid", reason: "expired" };
  const accessToken = get("access_token");
  if (accessToken && get("type") === "recovery") return { status: "ready", accessToken };
  return { status: "invalid", reason: "missing" };
}

/**
 * Reads the link once and remembers it, so the token can be removed from the address bar and still
 * be used. Browser only; the same object comes back on every call (needed by useSyncExternalStore).
 */
export function readRecoveryLink(): RecoveryLink {
  const key = `${window.location.search}${window.location.hash}`;
  // After the token is stripped the address is empty: keep the link that was read.
  if (!cached || (key !== "" && cached.key !== key)) cached = { key, link: parse(window.location) };
  return cached.link;
}

/** Removes the token, error and code from the address bar and history entry. */
export function stripRecoveryLinkFromUrl(): void {
  if (window.location.hash || window.location.search) {
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }
}
