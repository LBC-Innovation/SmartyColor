import type { AdminUser, ApiResult, User } from "@/lib/api/types";

const TOKEN_KEY = "cm_access_token";
const SESSION_HINT_KEY = "cm_session_hint";

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
}

export interface AuthData {
  user: { id: string; email: string } | null;
  session: AuthSession | null;
}

export function isError<T>(result: ApiResult<T>): result is Extract<ApiResult<T>, { error: { message: string } }> {
  return result.error !== null;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  clearSessionHint();
}

export function hasSessionToken(): boolean {
  return Boolean(getToken());
}

export interface SessionHint {
  id: string;
  email: string;
}

export function storeSessionHint(hint: SessionHint): void {
  try {
    localStorage.setItem(SESSION_HINT_KEY, JSON.stringify(hint));
  } catch {
    /* ignore */
  }
}

export function readSessionHint(): SessionHint | null {
  try {
    const raw = localStorage.getItem(SESSION_HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionHint>;
    if (typeof parsed.id === "string" && typeof parsed.email === "string") {
      return { id: parsed.id, email: parsed.email };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearSessionHint(): void {
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* ignore */
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const token = getToken();
  try {
    const res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { data: null, error: { message: `Request failed (${res.status})` } };
    }

    const parsed = body as ApiResult<T>;
    if (!res.ok && parsed.error === null) {
      return { data: null, error: { message: `Request failed (${res.status})` } };
    }
    return parsed;
  } catch {
    return { data: null, error: { message: "Network error", code: "UNAVAILABLE" } };
  }
}

export async function login(email: string, password: string): Promise<ApiResult<AuthData>> {
  const result = await request<{
    user: { id: string; email: string } | null;
    session: AuthSession | null;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (isError(result)) return result;
  if (result.data.session?.access_token) storeToken(result.data.session.access_token);
  return {
    data: { user: result.data.user, session: result.data.session },
    error: null,
  };
}

export async function register(email: string, password: string): Promise<ApiResult<unknown>> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<ApiResult<{ success: boolean }>> {
  const result = await request<{ success: boolean }>("/auth/logout", { method: "POST" });
  clearToken();
  return result;
}

export async function fetchMe(): Promise<ApiResult<User>> {
  return request<User>("/auth/me");
}

export function listAdminUsers(): Promise<ApiResult<AdminUser[]>> {
  return request<AdminUser[]>("/admin/users");
}

export function adminUpdateUser(
  id: string,
  updates: { display_name?: string; avatar_url?: string },
): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function adminUpdateUserEmail(id: string, email: string): Promise<ApiResult<{ email: string }>> {
  return request<{ email: string }>(`/admin/users/${id}/email`, {
    method: "PATCH",
    body: JSON.stringify({ email }),
  });
}

export function createAdminUser(email: string, password: string): Promise<ApiResult<{ id: string; email: string }>> {
  return request<{ id: string; email: string }>("/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function suspendUser(id: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/admin/users/${id}/suspend`, { method: "PATCH" });
}

export function unsuspendUser(id: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/admin/users/${id}/unsuspend`, { method: "PATCH" });
}

export function adminResetPassword(id: string, password: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/admin/users/${id}/password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function deleteAdminUser(id: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/admin/users/${id}`, { method: "DELETE" });
}

export function unverifyUser(id: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/admin/users/${id}/unverify`, { method: "POST" });
}

export function sendMagicLink(id: string, redirectTo: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/admin/users/${id}/magic-link`, {
    method: "POST",
    body: JSON.stringify({ redirectTo }),
  });
}

export function resendVerificationEmail(id: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/admin/users/${id}/resend-verification`, { method: "POST" });
}

export function verifyUser(id: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/admin/users/${id}/verify`, { method: "POST" });
}

export function updateUserPermissions(
  id: string,
  permissions: string[],
): Promise<ApiResult<{ permissions: string[] }>> {
  return request<{ permissions: string[] }>(`/admin/users/${id}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions }),
  });
}
