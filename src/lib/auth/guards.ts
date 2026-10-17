import type { AuthUser } from "@/lib/auth/authenticate";
import type { Permission } from "@/lib/auth/permissionMeta";

/** There is no master role: an account can do exactly what its permissions name. */
export function requirePermission(user: AuthUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

/** The permission, or the account acting on itself with full self-management. */
export function requirePermissionOrSelfManage(
  user: AuthUser,
  targetId: string,
  permission: Permission,
): boolean {
  const isSelf = user.id === targetId;
  const hasSelfManage = user.permissions.includes("usermanage:selfmanage");
  return user.permissions.includes(permission) || (isSelf && hasSelfManage);
}
