/** Codes the API sends (HTTP 429) when a guest is over a daily limit. Shared by server and browser. */
export const GUEST_LIMIT_CODE = "GUEST_LIMIT";
export const GUEST_GLOBAL_LIMIT_CODE = "GUEST_BUSY";

export type GuestLimitScope = "ip" | "global";

/** Which limit a response code means, or null when it is not a guest limit. */
export function guestLimitScope(status: number, code: string | undefined): GuestLimitScope | null {
  if (status !== 429) return null;
  if (code === GUEST_LIMIT_CODE) return "ip";
  if (code === GUEST_GLOBAL_LIMIT_CODE) return "global";
  return null;
}
