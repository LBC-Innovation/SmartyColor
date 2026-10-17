import { MANAGE_PRICES_PERMISSION } from "@/lib/api/types";
import type { AuthUser } from "@/lib/auth/authenticate";

export function canManagePrices(user: Pick<AuthUser, "permissions">): boolean {
  return user.permissions.includes(MANAGE_PRICES_PERMISSION);
}
