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
  /** Total of paid, not canceled or refunded, orders in USD cents. */
  lifetimeSpendCents?: number;
  /** Latest account activity or sign-in, ISO; null if never. */
  lastActiveAt?: string | null;
}

/** Every grantable permission (see PERMISSION_META). */
export const USERMANAGE_PERMISSIONS = ALL_PERMISSIONS;

/** Grants the price catalog page (/admin/pricing). */
export const MANAGE_PRICES_PERMISSION = "pricing:manage";
