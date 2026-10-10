const GUEST_TRY_KEY = "cm_guest_try_free";

/** Marks a browser session as "try for free" (studio without account). */
export function markGuestTryFree(): void {
  try {
    sessionStorage.setItem(GUEST_TRY_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasGuestTryFree(): boolean {
  try {
    return sessionStorage.getItem(GUEST_TRY_KEY) === "1";
  } catch {
    return false;
  }
}

export const STUDIO_PATH = "/studio";
