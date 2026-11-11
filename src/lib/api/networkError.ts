export const NETWORK_ERROR_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

/** Browser fetch failures ("Failed to fetch", offline) get a plain message; other errors keep theirs. */
export function friendlyRequestError(error: unknown, fallback: string): string {
  if (error instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    return NETWORK_ERROR_MESSAGE;
  }
  if (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message)) {
    return NETWORK_ERROR_MESSAGE;
  }
  return error instanceof Error ? error.message : fallback;
}
