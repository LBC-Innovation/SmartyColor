import { removePrefix } from "@/server/storage/libraryFiles";
import type { AdminUser, ApiResult, CustomerCost } from "@/lib/api/types";
import { DEFAULT_STORAGE_USD_PER_GB_MONTH } from "@/lib/finance/types";
import { USERMANAGE_PERMISSIONS } from "@/lib/api/types";
import type { AuthUser } from "@/lib/auth/authenticate";
import { PRODUCT_FEATURES, storedFeatureAccess, type FeatureAccess } from "@/lib/auth/features";
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

/** Orders that earned money: paid and not canceled or refunded. */
const SPEND_STATUSES = ["paid", "submitting_to_lulu", "submitted_to_lulu", "in_production", "shipped", "delivered"];

type UserCostRow = {
  user_id: string;
  ai_calls: number | string;
  ai_cost_usd: number | string;
  storage_objects: number | string;
  storage_bytes: number | string;
  storage_gb_months: number | string;
};

/**
 * AI spend and storage per account (admin_user_costs, migration 0033). Null when the function
 * isn't there yet or fails, so the list still loads and the cost shows as unavailable.
 */
async function loadCustomerCosts(): Promise<{ byUser: Map<string, CustomerCost>; rate: number } | null> {
  const db = getSupabaseAdmin();
  const [costs, settings] = await Promise.all([
    db.rpc("admin_user_costs"),
    db.from("finance_settings").select("*").maybeSingle(),
  ]);
  if (costs.error) {
    log("warn", "customer costs unavailable", { error: costs.error.message });
    return null;
  }
  const rawRate = (settings.data as { storage_usd_per_gb_month?: number | string | null } | null)?.storage_usd_per_gb_month;
  const rate = rawRate == null ? DEFAULT_STORAGE_USD_PER_GB_MONTH : Number(rawRate);
  const map = new Map<string, CustomerCost>();
  for (const r of (costs.data ?? []) as UserCostRow[]) {
    const aiUsd = Number(r.ai_cost_usd);
    const storageBytes = Number(r.storage_bytes);
    const storageGbMonths = Number(r.storage_gb_months);
    const storageUsd = storageGbMonths * rate;
    map.set(r.user_id, {
      aiCalls: Number(r.ai_calls),
      aiUsd,
      storageFiles: Number(r.storage_objects),
      storageBytes,
      storageGbMonths,
      storageUsd,
      storageMonthlyUsd: (storageBytes / 1e9) * rate,
      storageUsdPerGbMonth: rate,
      totalUsd: aiUsd + storageUsd,
    });
  }
  return { byUser: map, rate };
}

/** An account with no AI calls or files yet. */
function noCost(rate: number): CustomerCost {
  return {
    aiCalls: 0,
    aiUsd: 0,
    storageFiles: 0,
    storageBytes: 0,
    storageGbMonths: 0,
    storageUsd: 0,
    storageMonthlyUsd: 0,
    storageUsdPerGbMonth: rate,
    totalUsd: 0,
  };
}

export async function listAdminUsers(): Promise<ApiResult<AdminUser[]>> {
  const {
    data: { users },
    error,
  } = await getSupabaseAuth().auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const db = getSupabaseAdmin();
  const [{ data: profiles }, { data: orders }, { data: activity }, costs] = await Promise.all([
    db.from("profiles").select("id, display_name, avatar_url, status, credits_balance"),
    db
      .from("book_orders")
      .select("user_id, status, total_cents")
      .not("user_id", "is", null)
      .is("deleted_at", null)
      .not("status", "in", "(draft,quoted)"),
    // Latest activity per account; the table is small, newest first.
    db.from("account_activity").select("user_id, occurred_at").order("occurred_at", { ascending: false }).limit(5000),
    loadCustomerCosts(),
  ]);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const orderStats = new Map<string, { count: number; spend: number }>();
  for (const o of orders ?? []) {
    const id = o.user_id as string;
    const cur = orderStats.get(id) ?? { count: 0, spend: 0 };
    cur.count += 1;
    if (SPEND_STATUSES.includes(o.status as string)) cur.spend += Number(o.total_cents ?? 0);
    orderStats.set(id, cur);
  }
  const lastActive = new Map<string, string>();
  for (const a of activity ?? []) {
    const id = a.user_id as string;
    if (!lastActive.has(id)) lastActive.set(id, a.occurred_at as string);
  }

  const list = users.map((u) => {
    const profile = profileMap.get(u.id) ?? {};
    const profileStatus = (profile as { status?: string }).status;
    const isBanned =
      u.banned_until &&
      u.banned_until !== "none" &&
      new Date(u.banned_until) > new Date();
    const status = profileStatus ?? (isBanned ? "suspended" : "active");
    const stats = orderStats.get(u.id);
    const activityAt = lastActive.get(u.id) ?? null;
    const signInAt = u.last_sign_in_at ?? null;
    const lastActiveAt =
      activityAt && signInAt ? (activityAt > signInAt ? activityAt : signInAt) : (activityAt ?? signInAt);
    return {
      id: u.id,
      email: u.email,
      displayName: (profile as { display_name?: string | null }).display_name ?? null,
      avatarUrl: (profile as { avatar_url?: string | null }).avatar_url ?? null,
      status,
      permissions: (u.app_metadata?.permissions as string[] | undefined) ?? [],
      emailConfirmed: !!u.email_confirmed_at,
      createdAt: u.created_at,
      creditsBalanceCents:
        (profile as { credits_balance?: number }).credits_balance ?? 0,
      features: storedFeatureAccess(u.app_metadata?.features),
      ordersCount: stats?.count ?? 0,
      lifetimeSpendCents: stats?.spend ?? 0,
      lastActiveAt,
      lifetimeCost: costs ? (costs.byUser.get(u.id) ?? noCost(costs.rate)) : null,
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

/**
 * A signed-in account changing its own verified email. Runs as the user (their access token), so
 * Supabase sends a confirmation link to the new address and only switches it once that's clicked.
 */
export async function requestOwnEmailChange(
  accessToken: string,
  email: string,
  currentEmail: string,
): Promise<ApiResult<{ email: string; pending: boolean }>> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { data: null, error: { message: "A valid email is required" } };
  }
  if (normalized === currentEmail.toLowerCase()) {
    return { data: { email: normalized, pending: false }, error: null };
  }

  const redirectTo = `${clientOrigin()}/account?email_changed=1`;
  const res = await fetch(`${supabaseUrl()}/auth/v1/user?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "PUT",
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: normalized }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { msg?: string; message?: string; error_description?: string };
    const message = body.msg || body.message || body.error_description || "Couldn't change your email";
    log("warn", "Self email change failed", { status: res.status, error: message });
    return { data: null, error: { message } };
  }

  log("info", "Self email change requested", { email: normalized });
  return { data: { email: normalized, pending: true }, error: null };
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
  const { error } = await getSupabaseAuth().auth.resend({
    type: "signup",
    email: user.email,
    options: { emailRedirectTo: clientOrigin() },
  });
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
      emailRedirectTo: redirectTo || `${clientOrigin()}/auth/callback`,
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

  // app_metadata merges by top-level key, so features are left alone.
  const { error } = await getSupabaseAuth().auth.admin.updateUserById(id, {
    app_metadata: { permissions },
  });
  if (error) return { data: null, error: { message: error.message } };
  log("info", "Permissions updated", { adminId, targetId: id, permissions });
  return { data: { permissions: permissions as string[] }, error: null };
}

export async function setFeatureAccess(
  id: string,
  features: unknown,
  adminId: string,
): Promise<ApiResult<{ features: FeatureAccess }>> {
  const input = (features && typeof features === "object" ? features : null) as Record<
    string,
    unknown
  > | null;
  const known = PRODUCT_FEATURES.map((f) => f.key as string);
  if (
    !input ||
    Array.isArray(features) ||
    Object.keys(input).length === 0 ||
    Object.entries(input).some(([key, value]) => !known.includes(key) || typeof value !== "boolean")
  ) {
    return {
      data: null,
      error: { message: `features must map ${known.join(" / ")} to true or false` },
    };
  }

  const {
    data: { user },
    error: getUserError,
  } = await getSupabaseAuth().auth.admin.getUserById(id);
  if (getUserError || !user) {
    return { data: null, error: { message: "User not found" } };
  }

  const next = { ...storedFeatureAccess(user.app_metadata?.features), ...input } as FeatureAccess;
  // app_metadata merges by top-level key, so permissions are left alone.
  const { error } = await getSupabaseAuth().auth.admin.updateUserById(id, {
    app_metadata: { features: next },
  });
  if (error) return { data: null, error: { message: error.message } };
  log("info", "Product access updated", { adminId, targetId: id, features: next });
  return { data: { features: next }, error: null };
}

/** Orders still being paid for, made or shipped: deleting the account would orphan them mid-way. */
const ORDER_IN_PROGRESS = ["awaiting_payment", "paid", "submitting_to_lulu", "submitted_to_lulu", "in_production"];

/**
 * Delete an account and everything in it. Purchase records stay (the database unlinks them from the
 * user), but first lose everything personal: address, email, gift note, cover, page lists, files.
 */
export async function deleteUser(id: string, adminId: string): Promise<ApiResult<{ success: boolean }>> {
  const db = getSupabaseAdmin();
  const { data: open, error: openErr } = await db
    .from("book_orders")
    .select("id")
    .eq("user_id", id)
    .in("status", ORDER_IN_PROGRESS)
    .is("deleted_at", null);
  if (openErr) return { data: null, error: { message: openErr.message } };
  if (open && open.length > 0) {
    return {
      data: null,
      error: {
        message: `This account has ${open.length === 1 ? "an order" : `${open.length} orders`} still in progress. Wait until ${open.length === 1 ? "it ships" : "they ship"} or cancel ${open.length === 1 ? "it" : "them"}, then delete the account.`,
      },
    };
  }

  const { error: scrubErr } = await db
    .from("book_orders")
    .update({
      contact_email: null,
      shipping_address: null,
      billing_address: null,
      gift_note: null,
      project_title: null,
      cover_design: null,
      digital_pages: null,
      print_pages: null,
      interior_url: null,
      cover_url: null,
      digital_pdf_path: null,
      interior_pdf_path: null,
      cover_pdf_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", id);
  if (scrubErr) return { data: null, error: { message: scrubErr.message } };

  const { error } = await getSupabaseAuth().auth.admin.deleteUser(id);
  if (error) return { data: null, error: { message: error.message } };
  // Most rows cascade from auth.users (orders and payments are unlinked instead); files don't, so
  // purge the user's folder, which also holds their book order files.
  try {
    await removePrefix(id, { actorId: adminId, source: "account_delete" });
  } catch (e) {
    log("warn", "Library file purge failed", { targetId: id, error: String(e) });
  }
  log("info", "User deleted", { adminId, targetId: id });
  return { data: { success: true }, error: null };
}

export type AdminActionContext = { authUser: AuthUser };
