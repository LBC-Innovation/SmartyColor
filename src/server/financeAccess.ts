import type { AuthUser } from "@/lib/auth/authenticate";
import { FINANCE_MANAGE_PERMISSION, FINANCE_VIEW_PERMISSION } from "@/lib/finance/types";

/** Managing costs implies seeing the dashboard they feed. */
export function canViewFinance(user: Pick<AuthUser, "permissions">): boolean {
  return user.permissions.includes(FINANCE_VIEW_PERMISSION) || canManageFinance(user);
}

export function canManageFinance(user: Pick<AuthUser, "permissions">): boolean {
  return user.permissions.includes(FINANCE_MANAGE_PERMISSION);
}
