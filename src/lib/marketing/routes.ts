/**
 * Pages anyone can read, signed in, signed out or with an expired session. They never redirect
 * to sign-in; an expired session is just cleared.
 */
export const MARKETING_PATHS = ["/", "/gift", "/story", "/terms"] as const;

export function isMarketingPath(pathname: string): boolean {
  return (MARKETING_PATHS as readonly string[]).includes(pathname);
}
