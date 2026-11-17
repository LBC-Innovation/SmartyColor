import type { AuthUser } from "@/lib/auth/authenticate";
import type { Permission } from "@/lib/auth/permissionMeta";

/** There is no master role: an account can do exactly what its permissions name. */
export function requirePermission(user: AuthUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

/**
 * The permission, or the account acting on itself. Every signed-in account manages its own
 * profile, email, password and account without holding a permission, so self-service never
 * makes someone look like staff. Use this only for actions that are safe to take on yourself:
 * never for permissions, suspension or marking an email verified.
 */
export function requirePermissionOrSelf(user: AuthUser, targetId: string, permission: Permission): boolean {
  return user.permissions.includes(permission) || user.id === targetId;
}
