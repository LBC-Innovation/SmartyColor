/** One guest address (IPv4, or an IPv6 /64 written "v6/2001:db8:1:2") and what its AI calls cost. */
export type GuestIpRow = {
  ip: string;
  calls: number;
  costUsd: number;
  firstAt: string;
  lastAt: string;
  /** ISO 3166-1 alpha-2, e.g. "US". Null when the platform reported no location (local dev). */
  country: string | null;
  /** ISO 3166-2 subdivision code without the country, e.g. "CA" for California. */
  region: string | null;
  city: string | null;
  postal: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type GuestCostTotals = { calls: number; costUsd: number; ips: number };

export type GuestCostsReport = {
  /** False until migration 0033 is applied; the page then only shows unattributed totals. */
  tracking: boolean;
  allTime: GuestCostTotals;
  last30d: GuestCostTotals;
  /** The last 30 UTC days, oldest first, zero-filled. Includes unattributed calls. */
  daily: Array<{ date: string; costUsd: number; calls: number }>;
  byIp: GuestIpRow[];
  byCountry: Array<{ country: string | null; calls: number; costUsd: number; ips: number }>;
  /**
   * Calls with no account and no address: guests from before addresses were recorded, and calls by
   * accounts that were since deleted. Null when there are none.
   */
  unattributed: { calls: number; costUsd: number; firstAt: string; lastAt: string } | null;
};

export type GuestCall = {
  id: string;
  at: string;
  operation: string;
  modelId: string;
  costUsd: number;
  country: string | null;
  region: string | null;
  city: string | null;
};
