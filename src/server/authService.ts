import type { User, ApiResult } from "@/lib/api/types";
import type { AuthUser } from "@/lib/auth/authenticate";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import { getSupabaseAdmin, getSupabaseAuth } from "@/lib/supabase/service";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

function profileToUser(
  authUser: AuthUser,
  profile: {
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
    plan_tier: string;
    credits_balance: number;
  },
): User {
  return {
    id: authUser.id,
    email: authUser.email,
    displayName: profile.display_name ?? authUser.email.split("@")[0] ?? "",
    avatarUrl: profile.avatar_url ?? undefined,
    createdAt: profile.created_at,
    role: authUser.role,
    permissions: authUser.permissions,
    planTier: profile.plan_tier,
    creditsBalance: profile.credits_balance,
  };
}

export async function register(
  email: string,
  password: string,
): Promise<ApiResult<unknown>> {
  const { data, error } = await getSupabaseAuth().auth.signUp({ email, password });
  if (error) {
    log("warn", "Register failed", { email, error: error.message });
    return { data: null, error: { message: error.message, code: error.code } };
  }
  return { data, error: null };
}

export async function login(
  email: string,
  password: string,
): Promise<ApiResult<unknown>> {
  const { data, error } = await getSupabaseAuth().auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    log("warn", "Login failed", { email, error: error.message });
    return { data: null, error: { message: error.message } };
  }
  return { data, error: null };
}

export async function logout(token: string, userId: string): Promise<ApiResult<{ success: boolean }>> {
  const { error } = await getSupabaseAuth().auth.admin.signOut(token);
  if (error) {
    log("error", "Logout failed", { userId, error: error.message });
    return { data: null, error: { message: error.message } };
  }
  return { data: { success: true }, error: null };
}

export async function passwordResetRequest(
  email: string,
  redirectTo?: string,
): Promise<ApiResult<{ success: boolean }>> {
  const options = redirectTo ? { redirectTo } : { redirectTo: `${clientOrigin()}/reset-password` };
  const { error } = await getSupabaseAuth().auth.resetPasswordForEmail(email, options);
  if (error) {
    return { data: null, error: { message: error.message } };
  }
  return { data: { success: true }, error: null };
}

export async function passwordResetConfirm(
  accessToken: string,
  password: string,
): Promise<ApiResult<{ success: boolean }>> {
  const {
    data: { user },
    error: getUserError,
  } = await getSupabaseAuth().auth.getUser(accessToken);
  if (getUserError || !user) {
    return { data: null, error: { message: "Invalid or expired token" } };
  }
  const { error: updateError } = await getSupabaseAuth().auth.admin.updateUserById(user.id, {
    password,
  });
  if (updateError) {
    return { data: null, error: { message: updateError.message } };
  }
  return { data: { success: true }, error: null };
}

export async function getMe(authUser: AuthUser): Promise<ApiResult<User>> {
  const { data: profile, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("display_name, avatar_url, created_at, plan_tier, credits_balance")
    .eq("id", authUser.id)
    .single();

  if (error || !profile) {
    return { data: null, error: { message: "Profile not found" } };
  }

  return {
    data: profileToUser(authUser, profile as Parameters<typeof profileToUser>[1]),
    error: null,
  };
}
