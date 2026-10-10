import type { AdminUser, ApiResult } from "@/lib/api/types";
import { USERMANAGE_PERMISSIONS } from "@/lib/api/types";
import type { AuthUser } from "@/lib/auth/authenticate";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import { getSupabaseAdmin, getSupabaseAuth } from "@/lib/supabase/service";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL not configured");
  return url;
}

function serviceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  return key;
}

export async function listAdminUsers(): Promise<ApiResult<AdminUser[]>> {
  const {
    data: { users },
    error,
  } = await getSupabaseAuth().auth.admin.listUsers();
  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const { data: profiles } = await getSupabaseAdmin()
    .from("profiles")
    .select("id, display_name, avatar_url, status");
  const profileMap = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const list = users.map((u) => {
    const profile = profileMap.get(u.id) ?? {};
    const profileStatus = (profile as { status?: string }).status;
    const isBanned =
      u.banned_until &&
      u.banned_until !== "none" &&
      new Date(u.banned_until) > new Date();
    const status = profileStatus ?? (isBanned ? "suspended" : "active");
    return {
      id: u.id,
      email: u.email,
      displayName: (profile as { display_name?: string | null }).display_name ?? null,
      avatarUrl: (profile as { avatar_url?: string | null }).avatar_url ?? null,
      status,
      permissions: (u.app_metadata?.permissions as string[] | undefined) ?? [],
      emailConfirmed: !!u.email_confirmed_at,
      createdAt: u.created_at,
    };
  });

  return { data: list, error: null };
}

export async function createAdminUser(
  email: string,
  password: string,
  adminId: string,
): Promise<ApiResult<{ id: string; email: string }>> {
  const {
    data: { user },
    error,
  } = await getSupabaseAuth().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !user) {
    log("error", "Create user failed", { adminId, email, error: error?.message });
    return { data: null, error: { message: error?.message ?? "Failed to create user" } };
  }
  log("info", "User created", { adminId, newUserId: user.id });
  return { data: { id: user.id, email: user.email ?? email }, error: null };
}

export async function resetPassword(
  id: string,
  password: string,
  adminId: string,
): Promise<ApiResult<{ success: boolean }>> {
  if (password.length < 6) {
    return { data: null, error: { message: "password must be at least 6 characters" } };
  }
  const { error } = await getSupabaseAuth().auth.admin.updateUserById(id, { password });
  if (error) {
    return { data: null, error: { message: error.message } };
  }
  log("info", "Admin password reset", { adminId, targetId: id });
  return { data: { success: true }, error: null };
}

export async function verifyUser(id: string, adminId: string): Promise<ApiResult<{ success: boolean }>> {
  const { error } = await getSupabaseAuth().auth.admin.updateUserById(id, { email_confirm: true });
  if (error) return { data: null, error: { message: error.message } };
  log("info", "User email verified by admin", { adminId, targetId: id });
  return { data: { success: true }, error: null };
}

export async function updateUserEmail(
  id: string,
  email: string,
  adminId: string,
): Promise<ApiResult<{ email: string }>> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { data: null, error: { message: "A valid email is required" } };
  }

  const {
    data: { user },
    error: getUserError,
  } = await getSupabaseAuth().auth.admin.getUserById(id);
  if (getUserError || !user) {
    return { data: null, error: { message: "User not found" } };
  }
  if (user.email_confirmed_at) {
    return { data: null, error: { message: "Verified emails cannot be changed" } };
  }

  if (user.email?.toLowerCase() !== normalized) {
    const { error: updateError } = await getSupabaseAuth().auth.admin.updateUserById(id, {
      email: normalized,
    });
    if (updateError) return { data: null, error: { message: updateError.message } };
  }

  const { error: resendError } = await getSupabaseAuth().auth.resend({
    type: "signup",
    email: normalized,
    options: { emailRedirectTo: clientOrigin() },
  });
  if (resendError) return { data: null, error: { message: resendError.message } };

  log("info", "Admin updated user email", { adminId, targetId: id, email: normalized });
  return { data: { email: normalized }, error: null };
}

export async function resendVerification(
  id: string,
  adminId: string,
): Promise<ApiResult<{ success: boolean }>> {
  const {
    data: { user },
    error: getUserError,
  } = await getSupabaseAuth().auth.admin.getUserById(id);
  if (getUserError || !user?.email) {
    return { data: null, error: { message: "User not found" } };
  }
  if (user.email_confirmed_at) {
    return { data: null, error: { message: "User email is already confirmed" } };
  }
  const { error } = await getSupabaseAuth().auth.resend({ type: "signup", email: user.email });
  if (error) return { data: null, error: { message: error.message } };
  log("info", "Verification email resent", { adminId, targetId: id });
  return { data: { success: true }, error: null };
}

export async function unverifyUser(id: string, adminId: string): Promise<ApiResult<{ success: boolean }>> {
  const resp = await fetch(`${supabaseUrl()}/rest/v1/rpc/admin_unverify_user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
    },
    body: JSON.stringify({ p_user_id: id }),
  });
  if (!resp.ok) {
    const body = (await resp.json()) as { message?: string };
    return { data: null, error: { message: body.message ?? `HTTP ${resp.status}` } };
  }
  log("info", "User email unverified", { adminId, targetId: id });
  return { data: { success: true }, error: null };
}

export async function sendMagicLink(
  id: string,
  redirectTo: string | undefined,
  adminId: string,
): Promise<ApiResult<{ success: boolean }>> {
  const {
    data: { user },
    error: getUserError,
  } = await getSupabaseAuth().auth.admin.getUserById(id);
  if (getUserError || !user?.email) {
    return { data: null, error: { message: "User not found" } };
  }
  const { error } = await getSupabaseAuth().auth.signInWithOtp({
    email: user.email,
    options: {
      shouldCreateUser: false,
      ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
    },
  });
  if (error) return { data: null, error: { message: error.message } };
  log("info", "Magic link sent", { adminId, targetId: id });
  return { data: { success: true }, error: null };
}

export async function updateProfile(
  id: string,
  updates: { display_name?: string; avatar_url?: string },
  adminId: string,
): Promise<ApiResult<{ success: boolean }>> {
  if (Object.keys(updates).length === 0) {
    return { data: null, error: { message: "No valid fields to update" } };
  }
  const { error } = await getSupabaseAdmin().from("profiles").update(updates).eq("id", id);
  if (error) return { data: null, error: { message: error.message } };
  log("info", "Admin updated profile", { adminId, targetId: id });
  return { data: { success: true }, error: null };
}

export async function suspendUser(id: string, adminId: string): Promise<ApiResult<{ success: boolean }>> {
  const { error: profileError } = await getSupabaseAdmin()
    .from("profiles")
    .upsert({ id, status: "suspended" }, { onConflict: "id" });
  if (profileError) return { data: null, error: { message: profileError.message } };

  const { error: banError } = await getSupabaseAuth().auth.admin.updateUserById(id, {
    ban_duration: "876000h",
  });
  if (banError) {
    log("warn", "Suspend: ban failed", { adminId, targetId: id, error: banError.message });
  }
  return { data: { success: true }, error: null };
}

export async function unsuspendUser(id: string, adminId: string): Promise<ApiResult<{ success: boolean }>> {
  const { error: profileError } = await getSupabaseAdmin()
    .from("profiles")
    .upsert({ id, status: "active" }, { onConflict: "id" });
  if (profileError) return { data: null, error: { message: profileError.message } };

  await getSupabaseAuth().auth.admin.updateUserById(id, { ban_duration: "none" });
  return { data: { success: true }, error: null };
}

export async function setPermissions(
  id: string,
  permissions: unknown,
  adminId: string,
): Promise<ApiResult<{ permissions: string[] }>> {
  if (!Array.isArray(permissions) || permissions.some((p) => typeof p !== "string")) {
    return { data: null, error: { message: "permissions must be an array of strings" } };
  }
  const invalid = (permissions as string[]).filter(
    (p) => !USERMANAGE_PERMISSIONS.includes(p as (typeof USERMANAGE_PERMISSIONS)[number]),
  );
  if (invalid.length > 0) {
    return { data: null, error: { message: `Unknown permissions: ${invalid.join(", ")}` } };
  }

  const {
    data: { user },
  } = await getSupabaseAuth().auth.admin.getUserById(id);
  const existingRole = (user?.app_metadata?.role as string | undefined) ?? "user";

  const { error } = await getSupabaseAuth().auth.admin.updateUserById(id, {
    app_metadata: { role: existingRole, permissions },
  });
  if (error) return { data: null, error: { message: error.message } };
  log("info", "Permissions updated", { adminId, targetId: id, permissions });
  return { data: { permissions: permissions as string[] }, error: null };
}

export async function deleteUser(id: string, adminId: string): Promise<ApiResult<{ success: boolean }>> {
  const { error } = await getSupabaseAuth().auth.admin.deleteUser(id);
  if (error) return { data: null, error: { message: error.message } };
  log("info", "User deleted", { adminId, targetId: id });
  return { data: { success: true }, error: null };
}

export type AdminActionContext = { authUser: AuthUser };
