/**
 * Pages anyone can read, signed in, signed out or with an expired session. They never redirect
 * to sign-in; an expired session is just cleared.
 */
export const MARKETING_PATHS = ["/", "/gift", "/birthday", "/pets", "/partners", "/story", "/terms"] as const;

export function isMarketingPath(pathname: string): boolean {
  return (MARKETING_PATHS as readonly string[]).includes(pathname);
}

/** Sign-in, sign-up and password recovery. A dead session never redirects away from these. */
export const AUTH_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"] as const;

export function isAuthPath(pathname: string): boolean {
  return (AUTH_PATHS as readonly string[]).includes(pathname);
}
