import type { AuthUser } from "@/lib/auth/authenticate";

export function requirePermission(user: AuthUser, permission: string): boolean {
  return user.permissions.includes(permission);
}

export function requireAdminOrSelfManage(user: AuthUser, targetId: string): boolean {
  const isSelf = user.id === targetId;
  const hasSelfManage = user.permissions.includes("usermanage:selfmanage");
  const canManageUsers = user.permissions.includes("usermanage:listusers");
  return user.role === "admin" || canManageUsers || (isSelf && hasSelfManage);
}

export function requirePermissionOrSelfManage(
  user: AuthUser,
  targetId: string,
  permission: string,
): boolean {
  const isSelf = user.id === targetId;
  const hasSelfManage = user.permissions.includes("usermanage:selfmanage");
  return user.permissions.includes(permission) || (isSelf && hasSelfManage);
}
