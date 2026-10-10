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
  role: string;
  permissions: string[];
  planTier: string;
  creditsBalance: number;
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
}

export const USERMANAGE_PERMISSIONS = [
  "usermanage:add",
  "usermanage:suspend",
  "usermanage:updatepassword",
  "usermanage:listusers",
  "usermanage:deleteusers",
  "usermanage:editpermissions",
  "usermanage:selfmanage",
] as const;
