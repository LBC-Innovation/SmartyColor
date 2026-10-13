import type { AdminUser, ApiResult, User } from "@/lib/api/types";
import type { BookBindingId } from "@/lib/print/bookBindings";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";
import type { BookOrderDetail, BookOrderSummary, DigitalBookPage, ShippingAddress } from "@/lib/orders/types";
import type { CreditLedgerEntry, CreditTopUpConfirmation, PromoCreditSettings } from "@/lib/credits/types";
import type { ActivityFilter, ActivityPage } from "@/lib/activity/types";

const TOKEN_KEY = "cm_access_token";
const REFRESH_TOKEN_KEY = "cm_refresh_token";
const SESSION_HINT_KEY = "cm_session_hint";
/** Renew a token this long before it lapses, so a request never goes out already stale. */
const REFRESH_SKEW_MS = 60_000;
const REFRESH_LOCK_NAME = "cm_session_refresh";
/** Calls that run before or without a signed-in session; a 401 here is not an expired session. */
const SESSION_AGNOSTIC_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/logout",
  "/auth/refresh",
  "/auth/password-reset",
];

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

/** Keep the access token and the refresh token that can renew it. */
export function storeSession(session: Pick<AuthSession, "access_token" | "refresh_token">): void {
  storeToken(session.access_token);
  try {
    if (session.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  clearSessionHint();
}

function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Expiry (ms since epoch) from the JWT's `exp` claim, or null if it can't be read. */
function tokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function isStale(token: string): boolean {
  const expiry = tokenExpiryMs(token);
  return expiry !== null && expiry - Date.now() < REFRESH_SKEW_MS;
}

// --- Session expiry -------------------------------------------------------------------------

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/** Called when the session is over and cannot be silently renewed. Returns an unsubscribe. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function expireSession(): void {
  clearToken();
  sessionExpiredListeners.forEach((listener) => listener());
}

export type RefreshOutcome = "refreshed" | "expired" | "unavailable";

let refreshInFlight: Promise<RefreshOutcome> | null = null;

async function runRefresh(staleToken: string | null): Promise<RefreshOutcome> {
  // Another tab may have renewed while this one waited for the lock.
  const current = getToken();
  if (current && current !== staleToken && !isStale(current)) return "refreshed";
  if (!current) return "expired";

  const refreshToken = getRefreshToken();
  if (!refreshToken) return "expired";

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (res.ok) {
      const body = (await res.json()) as ApiResult<{ session: AuthSession | null }>;
      if (body.error === null && body.data.session?.access_token) {
        storeSession(body.data.session);
        return "refreshed";
      }
      return "expired";
    }
    // A 4xx is a verdict from the auth server; anything else is an outage, not a logout.
    return res.status >= 400 && res.status < 500 ? "expired" : "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * Renew the session with the stored refresh token. Concurrent callers share one attempt, and a
 * Web Lock keeps tabs from spending the same (single-use) refresh token twice.
 */
export function refreshSession(): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;
  const staleToken = getToken();
  const run = async (): Promise<RefreshOutcome> => {
    try {
      if (typeof navigator !== "undefined" && navigator.locks) {
        return await navigator.locks.request(REFRESH_LOCK_NAME, () => runRefresh(staleToken));
      }
      return await runRefresh(staleToken);
    } finally {
      refreshInFlight = null;
    }
  };
  refreshInFlight = run();
  return refreshInFlight;
}

/**
 * Make sure the stored token is usable, renewing it if it is about to lapse. When it cannot be
 * renewed the session is expired. Safe to call whenever the page becomes active again.
 */
export async function ensureFreshSession(): Promise<RefreshOutcome | "none"> {
  const token = getToken();
  if (!token) return "none";
  if (!isStale(token)) return "refreshed";
  const outcome = await refreshSession();
  if (outcome === "expired") expireSession();
  return outcome;
}

/**
 * fetch() for our own API. Attaches the session token (when `withAuth`), renews it ahead of
 * expiry, and on a 401 renews once and retries. If renewal is impossible the session is expired
 * and listeners (the app shell) send the user to sign in.
 */
export async function authedFetch(
  input: string,
  init: RequestInit = {},
  { withAuth = true, handleExpiry = true } = {},
): Promise<Response> {
  if (withAuth && handleExpiry) await ensureFreshSession();

  const send = (): Promise<Response> => {
    const token = withAuth ? getToken() : null;
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  const sentWith = withAuth ? getToken() : null;
  const res = await send();
  if (res.status !== 401 || !sentWith || !handleExpiry) return res;

  // Someone else (another tab, a parallel request) may already have ended or renewed the session.
  if (!getToken()) return res;
  const outcome = getToken() !== sentWith ? "refreshed" : await refreshSession();
  if (outcome === "refreshed") return send();
  if (outcome === "expired") expireSession();
  return res;
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

export async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const handleExpiry = !SESSION_AGNOSTIC_PATHS.some((p) => path.startsWith(p));
  try {
    const res = await authedFetch(
      `/api${path}`,
      {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers ?? {}),
        },
      },
      { handleExpiry },
    );

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
  if (result.data.session?.access_token) storeSession(result.data.session);
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

export function listOrders(): Promise<ApiResult<BookOrderSummary[]>> {
  return request<BookOrderSummary[]>("/orders");
}

export function fetchOrder(id: string, sync = true): Promise<ApiResult<BookOrderDetail>> {
  const qs = sync ? "" : "?sync=0";
  return request<BookOrderDetail>(`/orders/${id}${qs}`);
}

export type OrderQuoteData = {
  estimatedTotalCents: number | null;
  printCents: number | null;
  shippingCents: number | null;
  currency: string;
  source: string;
  shippingPostcode?: string | null;
  shippingLevel?: string;
  quoteError?: string | null;
};

export function fetchOrderQuote(input: {
  bindingId: BookBindingId;
  pageCount: number;
  shippingPostcode?: string;
  shippingLevel?: string;
  shippingAddress?: Partial<ShippingAddress>;
}): Promise<ApiResult<OrderQuoteData>> {
  return request("/orders/quote", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type BookDraftPayload = {
  bindingId: BookBindingId;
  pageCount: number;
  photoCount: number;
  blankCount: number;
  projectTitle: string;
  estimatedTotalCents: number | null;
  shippingPostcode?: string | null;
  shippingAddress?: ShippingAddress | null;
};

export function createDraftBookOrder(
  input: BookDraftPayload,
): Promise<ApiResult<{ orderId: string }>> {
  return request("/orders/draft", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateDraftBookOrder(
  orderId: string,
  input: Omit<BookDraftPayload, "photoCount" | "blankCount">,
): Promise<ApiResult<{ orderId: string }>> {
  return request(`/orders/${orderId}/draft`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateOrderShippingAddress(
  orderId: string,
  shippingAddress: ShippingAddress,
): Promise<ApiResult<{ orderId: string }>> {
  return request(`/orders/${orderId}/shipping`, {
    method: "PATCH",
    body: JSON.stringify({ shippingAddress }),
  });
}

export function confirmDraftBookOrder(
  orderId: string,
): Promise<ApiResult<{ orderId: string; status: string }>> {
  return request(`/orders/${orderId}/confirm`, {
    method: "POST",
  });
}

export function placeBookOrder(orderId: string): Promise<
  ApiResult<{
    orderId: string;
    status: string;
    creditsBalanceCents: number;
    creditsAppliedCents: number;
  }>
> {
  return request(`/orders/${orderId}/place`, {
    method: "POST",
  });
}

/** Buy a print-at-home book; the wallet is charged and the order is created paid. */
export function createDigitalBookOrder(input: {
  projectTitle: string;
  pages: DigitalBookPage[];
}): Promise<ApiResult<{ orderId: string; creditsBalanceCents: number; creditsAppliedCents: number }>> {
  return request("/orders/digital", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Save a paid digital order's PDF to the user's device. Free to repeat. */
export async function downloadOrderPdf(orderId: string, fileName = "colorful-memories-book"): Promise<ApiResult<true>> {
  try {
    const res = await authedFetch(`/api/orders/${orderId}/pdf`);
    if (!res.ok) {
      let message = "Could not download the PDF.";
      try {
        const body = (await res.json()) as ApiResult<never>;
        if (body.error?.message) message = body.error.message;
      } catch {
        /* keep default */
      }
      return { data: null, error: { message } };
    }
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "colorful-memories-book"}.pdf`;
    link.click();
    URL.revokeObjectURL(link.href);
    return { data: true, error: null };
  } catch {
    return { data: null, error: { message: "Network error", code: "UNAVAILABLE" } };
  }
}

export function createCreditTopUpCheckout(input: {
  amountCents: number;
  returnPath: string;
}): Promise<ApiResult<{ checkoutUrl: string }>> {
  return request("/credits/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Back from Stripe Checkout: have the server verify the payment and credit the wallet. */
export function confirmCreditTopUp(sessionId: string): Promise<ApiResult<CreditTopUpConfirmation>> {
  return request<CreditTopUpConfirmation>("/credits/confirm", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export function listMyCreditLedger(): Promise<ApiResult<CreditLedgerEntry[]>> {
  return request<CreditLedgerEntry[]>("/credits/ledger");
}

export function listMyActivity(
  filter: ActivityFilter & { offset?: number } = {},
): Promise<ApiResult<ActivityPage>> {
  const qs = new URLSearchParams();
  if (filter.category) qs.set("category", filter.category);
  if (filter.type) qs.set("type", filter.type);
  if (filter.moneyOnly) qs.set("money", "1");
  if (filter.offset) qs.set("offset", String(filter.offset));
  const query = qs.toString();
  return request<ActivityPage>(`/activity${query ? `?${query}` : ""}`);
}

export function fetchActivityReceiptUrl(activityId: string): Promise<ApiResult<{ url: string }>> {
  return request<{ url: string }>(`/activity/${activityId}/receipt`);
}

export function adminListUserCredits(userId: string): Promise<ApiResult<CreditLedgerEntry[]>> {
  return request<CreditLedgerEntry[]>(`/admin/users/${userId}/credits`);
}

export function adminListUserOrders(
  userId: string,
  includeHidden = true,
): Promise<ApiResult<AdminUserOrderSummary[]>> {
  const qs = includeHidden ? "?includeHidden=1" : "";
  return request<AdminUserOrderSummary[]>(`/admin/users/${userId}/orders${qs}`);
}

export function adminCancelUserOrder(
  userId: string,
  orderId: string,
): Promise<ApiResult<{ status: string }>> {
  return request<{ status: string }>(`/admin/users/${userId}/orders/${orderId}/cancel`, {
    method: "POST",
  });
}

export function adminHideUserOrder(
  userId: string,
  orderId: string,
): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/admin/users/${userId}/orders/${orderId}/hide`, {
    method: "POST",
  });
}

export function adminAdjustUserCredits(
  userId: string,
  input: { deltaCents: number; note?: string } | { amountDollars: string; note?: string },
): Promise<ApiResult<{ creditsBalanceCents: number }>> {
  return request<{ creditsBalanceCents: number }>(`/admin/users/${userId}/credits`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function adminGetPromoCredits(): Promise<ApiResult<PromoCreditSettings>> {
  return request<PromoCreditSettings>("/admin/promo-credits");
}

export function adminUpdatePromoCredits(input: {
  welcomeCreditDollars: string;
}): Promise<ApiResult<PromoCreditSettings>> {
  return request<PromoCreditSettings>("/admin/promo-credits", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
