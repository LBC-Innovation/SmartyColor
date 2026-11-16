import type { Channel } from "@/lib/marketing/channel";

/** Which touch credits a customer: the first visit we saw, or the last one before signing up. */
export type AttributionModel = "first" | "last";

export type ChannelRow = {
  channel: Channel;
  /** Accounts created in the period. */
  signups: number;
  /** Accounts whose first paid order fell in the period. */
  newCustomers: number;
  /** Paid orders in the period (any customer, by their acquisition channel). */
  orders: number;
  revenueCents: number;
  /** Ad spend entered for the period. */
  spendCents: number;
  /** Guests (no account) from this channel: AI calls and what they cost. */
  guestAddresses: number;
  guestAiCostUsd: number;
};

export type SourceRow = {
  channel: Channel;
  source: string;
  campaign: string;
  signups: number;
  newCustomers: number;
  revenueCents: number;
  spendCents: number;
};

export type HeardFromRow = { answer: string; count: number; customers: number; details: string[] };

export type ReferrerRow = {
  userId: string;
  label: string;
  code: string;
  signups: number;
  customers: number;
  creditedCents: number;
};

export type AcquisitionDay = { day: string; signups: number; newCustomers: number; revenueCents: number };

export type AcquisitionReport = {
  from: string;
  to: string;
  model: AttributionModel;
  totals: {
    signups: number;
    newCustomers: number;
    orders: number;
    revenueCents: number;
    spendCents: number;
    /** Sign-ups with no recorded source at all (before tracking, or a blocked cookie). */
    unattributedSignups: number;
    medianDaysToFirstOrder: number | null;
    heardFromAnswered: number;
  };
  channels: ChannelRow[];
  sources: SourceRow[];
  heardFrom: HeardFromRow[];
  referrers: ReferrerRow[];
  daily: AcquisitionDay[];
  /** False until migration 0036 is applied (survey, spend and guest channels are then empty). */
  tracking: boolean;
};

export type SpendEntry = {
  id: string;
  month: string; // YYYY-MM-01
  channel: Channel;
  source: string;
  campaign: string;
  amountCents: number;
  note: string | null;
  updatedAt: string;
};

export type MarketingLink = {
  id: string;
  slug: string;
  url: string;
  destination: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string | null;
  promoNote: string | null;
  clicks: number;
  lastClickAt: string | null;
  archived: boolean;
  createdAt: string;
};

export type MarketingLinkInput = {
  slug: string;
  destination: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent?: string | null;
  promoNote?: string | null;
};
