/** Cookie that remembers a user chose not to see the welcome guide again. */
export const WELCOME_GUIDE_COOKIE = "cm_welcome_guide_dismissed";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function readWelcomeGuideDismissed(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${WELCOME_GUIDE_COOKIE}=1`));
}

export function writeWelcomeGuideDismissed(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${WELCOME_GUIDE_COOKIE}=1; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
}

export function clearWelcomeGuideDismissed(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${WELCOME_GUIDE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}
