/** Which screens a signed-in customer opened, recorded for the admin History tab. */

/** Query values worth keeping: they say which step or tab, never who or a secret. */
const KEPT_PARAMS = ["step", "tab", "book", "binding"] as const;

/** Paths whose last part is a secret or someone else's id; only the prefix is kept. */
const TRIMMED_PREFIXES = ["/redeem/", "/friend/", "/join/", "/p/", "/auth/"];

/** Screens never recorded: staff tools, and the sign-in callback that carries tokens. */
const SKIPPED_PREFIXES = ["/admin", "/auth", "/vision-costs", "/dev"];

const MAX_PATH = 300;

/**
 * The form a page view is stored in, or null when it should not be recorded. Runs on both sides:
 * the browser to decide whether to send, the server so a hand-made request can't store anything else.
 */
export function pageViewPath(pathname: string, search = ""): string | null {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
  let path = pathname.replace(/\/+$/, "") || "/";
  if (SKIPPED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  const trimmed = TRIMMED_PREFIXES.find((p) => path.startsWith(p));
  if (trimmed) return trimmed.slice(0, -1);

  const query = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of KEPT_PARAMS) {
    const value = query.get(key);
    if (value && /^[\w-]{1,40}$/.test(value)) kept.set(key, value);
  }
  const qs = kept.toString();
  path = qs ? `${path}?${qs}` : path;
  return path.length <= MAX_PATH ? path : null;
}

const SCREEN_NAMES: Array<[string, string]> = [
  ["/studio/new", "the book builder"],
  ["/studio/order", "the book order page"],
  ["/studio", "the studio"],
  ["/storybook", "the storybook"],
  ["/story", "the story page"],
  ["/home", "home"],
  ["/account", "their account"],
  ["/activity", "their activity"],
  ["/orders", "their orders"],
  ["/sign-in", "sign in"],
  ["/sign-up", "sign up"],
  ["/forgot-password", "forgot password"],
  ["/reset-password", "reset password"],
  ["/redeem", "redeem a code"],
  ["/friend", "a friend's invite link"],
  ["/join", "an album invite"],
  ["/gift", "the gift page"],
  ["/birthday", "the birthday page"],
  ["/pets", "the pets page"],
  ["/partners", "the partners page"],
  ["/share", "the share page"],
  ["/terms", "the terms"],
  ["/unsubscribe", "unsubscribe"],
  ["/p", "a shared page"],
];

/** "the book builder (step: pay)" for a stored path. */
export function pageViewLabel(path: string): string {
  const [pathname, search = ""] = path.split("?");
  const match =
    pathname === "/" ? "the landing page" : SCREEN_NAMES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1];
  const base = match ?? pathname;
  const params = new URLSearchParams(search);
  const details = [...params.entries()].map(([k, v]) => `${k}: ${v}`);
  return details.length ? `${base} (${details.join(", ")})` : base;
}
