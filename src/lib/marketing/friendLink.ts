/**
 * Share with a friend links. What's shared is short, `/friend/CODE?v=qr`, so the QR code stays
 * easy to scan and a texted link stays readable. The landing page expands it into the tags the
 * attribution cookie records; the database grants the sign-up credit only for a touch that has
 * both `ref` and utm_campaign=share_with_a_friend (migration 0040).
 */

/** The campaign tag the database looks for before granting the sign-up credit. */
export const FRIEND_CAMPAIGN = "share_with_a_friend";

/** Query param on a shared link saying how it was sent. */
export const FRIEND_VIA_PARAM = "v";

/** How the link was sent, kept as utm_content so reports can tell a scan from a text. */
export type FriendLinkVia = "link" | "qr" | "sms" | "email";

const VIAS: readonly FriendLinkVia[] = ["link", "qr", "sms", "email"];

export function friendPath(code: string, via: FriendLinkVia = "link"): string {
  const path = `/friend/${encodeURIComponent(code)}`;
  return via === "link" ? path : `${path}?${FRIEND_VIA_PARAM}=${via}`;
}

/**
 * The tags to add to a landing URL for `code`, or null when it already carries a ref (a tagged
 * link was used as-is) or the code is not a plausible one.
 */
export function friendTagsFor(code: string, params: URLSearchParams): Record<string, string> | null {
  if (params.get("ref") || !/^[A-Z0-9]{4,16}$/.test(code)) return null;
  const v = params.get(FRIEND_VIA_PARAM) as FriendLinkVia | null;
  return {
    ref: code,
    utm_source: "referral",
    utm_medium: "friend_link",
    utm_campaign: FRIEND_CAMPAIGN,
    utm_content: v && VIAS.includes(v) ? v : "link",
  };
}
