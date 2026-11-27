import { ALL_PERMISSIONS } from "@/lib/auth/permissionMeta";
import type { FeatureAccess } from "@/lib/auth/features";

export type ApiError = {
  data: null;
  error: { message: string; code?: string };
};

export type ApiResult<T> =
  | { data: T; error: null }
  | ApiError;

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
  permissions: string[];
  planTier: string;
  /** Promo wallet balance in USD cents. */
  creditsBalanceCents: number;
  /** Product lines this account can open. */
  features: FeatureAccess;
}

export interface AdminUser {
  id: string;
  email: string | undefined;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  permissions: string[];
  emailConfirmed: boolean;
  createdAt: string;
  /** Promo wallet balance in USD cents. */
  creditsBalanceCents: number;
  /** Product-line toggles saved on the account. */
  features: FeatureAccess;
  /** Book orders placed (drafts and quotes left out). Optional: single-user endpoints may omit it. */
  ordersCount?: number;
  /**
   * What they bought, however they paid (wallet or card), less refunds of those purchases, in USD
   * cents. Includes books, packages and pages paid from gifted credit.
   */
  lifetimeSpendCents?: number;
  /** Charged to their card (top-ups and card purchases) less refunds to the card; null when unavailable. */
  cardPaidCents?: number | null;
  /** Latest account activity or sign-in, ISO; null if never. */
  lastActiveAt?: string | null;
  /** What serving this account has cost so far. Null when the numbers couldn't be loaded. */
  lifetimeCost?: CustomerCost | null;
}

/** AI calls and image storage for one account, in USD (AI amounts are often fractions of a cent). */
export interface CustomerCost {
  aiCalls: number;
  aiUsd: number;
  /** Library images held now (photos, versions, pages and thumbnails). */
  storageFiles: number;
  storageBytes: number;
  /** Bytes held × time held, since each file was saved. */
  storageGbMonths: number;
  storageUsd: number;
  /** What keeping today's files costs per month at the current rate. */
  storageMonthlyUsd: number;
  storageUsdPerGbMonth: number;
  totalUsd: number;
}

/** Every grantable permission (see PERMISSION_META). */
export const USERMANAGE_PERMISSIONS = ALL_PERMISSIONS;

/** Grants the price catalog page (/admin/pricing). */
export const MANAGE_PRICES_PERMISSION = "pricing:manage";
