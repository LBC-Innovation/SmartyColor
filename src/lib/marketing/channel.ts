/**
 * Sorts a visit into one acquisition channel from its campaign tags, click ids and referring site.
 * Pure: the browser runs it when it records a visit, and the admin reports run it again on stored
 * touches so older rows (and rules changed later) are classified the same way.
 */

export const CHANNELS = [
  "paid_search",
  "paid_social",
  "display",
  "organic_search",
  "organic_social",
  "email",
  "friend_referral",
  "share",
  "partner",
  "offline",
  "referral_site",
  "direct",
] as const;

export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  paid_search: "Paid search",
  paid_social: "Paid social",
  display: "Display ads",
  organic_search: "Organic search",
  organic_social: "Organic social",
  email: "Email",
  friend_referral: "Friend referral",
  share: "Shared pages & invites",
  partner: "Partners & influencers",
  offline: "Print & QR",
  referral_site: "Other websites",
  direct: "Direct / unknown",
};

/** The fields of a touch this module reads. */
export type ChannelInput = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ref?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  msclkid?: string;
  fbclid?: string;
  ttclid?: string;
  li_fat_id?: string;
  epik?: string;
  twclid?: string;
  sccid?: string;
  /** Hostname of the referring site, when it wasn't this site. */
  referrer?: string;
};

const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|brave|startpage|qwant|ask|aol|naver|perplexity|chatgpt|you)\.[a-z.]+$/;
const SOCIAL_HOSTS =
  /(^|\.)(facebook|fb|instagram|messenger|tiktok|pinterest|pin|reddit|youtube|youtu|linkedin|lnkd|threads|snapchat|nextdoor|tumblr|whatsapp|telegram|discord|bsky|mastodon|quora)\.[a-z.]+$|(^|\.)(t\.co|x\.com|twitter\.com|lm\.facebook\.com|l\.instagram\.com)$/;
const MAIL_HOSTS = /(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com|mail\.aol\.com|icloud\.com|proton\.me)$/;

const SEARCH_SOURCES = /^(google|bing|microsoft|duckduckgo|yahoo|ecosia|baidu|yandex|brave)$/;
const SOCIAL_SOURCES =
  /^(facebook|fb|meta|instagram|ig|tiktok|tt|pinterest|reddit|youtube|yt|linkedin|x|twitter|snapchat|snap|threads|nextdoor|whatsapp)$/;

function lc(v: string | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export function classifyChannel(t: ChannelInput): Channel {
  const source = lc(t.utm_source);
  const medium = lc(t.utm_medium);

  // Our own links first: they always carry these tags. Shared pages, invites and family emails
  // also carry the sharer's ref code (for the credit) but count as sharing, not the referral link.
  if (source === "share" || source === "family_email" || source === "album_invite" || medium === "page_link" || medium === "invite_link") {
    return "share";
  }
  if (t.ref || source === "referral" || medium === "friend_link") return "friend_referral";

  // Explicit paid mediums.
  if (/^(cpc|ppc|paid|paidsearch|paid_search|sem)$/.test(medium)) {
    return SOCIAL_SOURCES.test(source) ? "paid_social" : "paid_search";
  }
  if (/^(paid_social|paidsocial|social_paid|paid-social|cpm|cpv|video_ad)$/.test(medium)) return "paid_social";
  if (/^(display|banner|programmatic|retargeting)$/.test(medium)) return "display";
  if (/^(affiliate|influencer|partner|creator|ambassador|sponsorship|podcast)$/.test(medium)) return "partner";
  if (/^(qr|print|flyer|offline|insert|packaging|event|direct_mail)$/.test(medium)) return "offline";
  if (/^(email|e-mail|newsletter|lifecycle)$/.test(medium)) return "email";
  if (/^(social|organic_social|social_organic|bio|post|story)$/.test(medium)) return "organic_social";
  if (medium === "organic") return SOCIAL_SOURCES.test(source) ? "organic_social" : "organic_search";
  if (medium === "referral") return "referral_site";

  // Ad click ids without (or with unknown) tags.
  if (t.gclid || t.gbraid || t.wbraid || t.msclkid) return "paid_search";
  if (t.ttclid || t.li_fat_id || t.epik || t.twclid || t.sccid) return "paid_social";

  // A source alone.
  if (source) {
    if (SEARCH_SOURCES.test(source)) return "organic_search";
    if (SOCIAL_SOURCES.test(source)) return "organic_social";
    return "referral_site";
  }

  // Facebook and Instagram add fbclid to every outbound link, paid or not.
  if (t.fbclid) return "organic_social";

  const host = lc(t.referrer);
  if (host) {
    if (MAIL_HOSTS.test(host)) return "email";
    if (SEARCH_HOSTS.test(host)) return "organic_search";
    if (SOCIAL_HOSTS.test(host)) return "organic_social";
    return "referral_site";
  }
  return "direct";
}

/** A short source name for reports: the utm_source, else the platform behind a click id, else the referring site. */
export function sourceName(t: ChannelInput): string {
  const source = lc(t.utm_source);
  if (source) return source;
  if (t.ref) return "referral";
  if (t.gclid || t.gbraid || t.wbraid) return "google";
  if (t.msclkid) return "bing";
  if (t.ttclid) return "tiktok";
  if (t.fbclid) return "facebook";
  if (t.li_fat_id) return "linkedin";
  if (t.epik) return "pinterest";
  if (t.twclid) return "x";
  if (t.sccid) return "snapchat";
  const host = lc(t.referrer).replace(/^(www|m|l|lm)\./, "");
  return host || "(direct)";
}
