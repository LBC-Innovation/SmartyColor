import "server-only";
import { createHash, randomInt } from "node:crypto";
import { readCookieFromHeader } from "@/lib/marketing/attribution";
import { AD_OPT_OUT_COOKIE, centsToValue, trackFormatForProduct } from "@/lib/marketing/events";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/**
 * Server copies of the `purchase` event: Meta Conversions API and the GA4 Measurement Protocol.
 * The browser sends the same event with the order id as its event id, so Meta keeps one.
 * Meta gets only a SHA-256 of the email plus the _fbp/_fbc cookies; GA4 gets only its client id.
 */

const META_API_VERSION = "v21.0";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

function envId(name: string): string | null {
  const v = process.env[name]?.trim();
  return v && /^[A-Za-z0-9-]{3,40}$/.test(v) ? v : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/** GA4's client id from its `_ga` cookie ("GA1.1.<id>.<time>"), or a fresh one. */
function gaClientId(cookieHeader: string | null): string {
  const ga = readCookieFromHeader(cookieHeader, "_ga");
  const parts = ga?.split(".");
  if (parts && parts.length >= 4) return `${parts[2]}.${parts[3]}`;
  return `${randomInt(1_000_000_000, 2_000_000_000)}.${Math.floor(Date.now() / 1000)}`;
}

/** The visitor opted out, or their browser sends Global Privacy Control. */
export function requestOptedOut(request: Request): boolean {
  if (request.headers.get("sec-gpc") === "1") return true;
  return readCookieFromHeader(request.headers.get("cookie"), AD_OPT_OUT_COOKIE) === "1";
}

type PurchaseOrder = {
  id: string;
  totalCents: number;
  productId: string;
  isGift: boolean;
};

async function loadOrder(orderId: string): Promise<PurchaseOrder | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; total_cents: number | null; product_id: string; is_gift?: boolean | null };
  if (row.total_cents == null) return null;
  return { id: row.id, totalCents: row.total_cents, productId: row.product_id, isGift: row.is_gift === true };
}

/**
 * Send the server-side `purchase` for a paid order. Values come from the order record, never the
 * browser. Safe to call without configuration: each platform is skipped when its keys are unset.
 */
export async function trackPurchaseServer(input: {
  request: Request;
  orderId: string;
  email: string;
}): Promise<void> {
  if (requestOptedOut(input.request)) return;
  const pixelId = envId("NEXT_PUBLIC_META_PIXEL_ID");
  const metaToken = process.env.META_CAPI_ACCESS_TOKEN?.trim();
  const ga4Id = envId("NEXT_PUBLIC_GA4_ID");
  const ga4Secret = process.env.GA4_API_SECRET?.trim();
  if (!(pixelId && metaToken) && !(ga4Id && ga4Secret)) return;

  const order = await loadOrder(input.orderId);
  if (!order) {
    log("warn", "Purchase not tracked: order missing or unpriced", { orderId: input.orderId });
    return;
  }
  const format = trackFormatForProduct(order.productId);
  const value = centsToValue(order.totalCents);
  const cookies = input.request.headers.get("cookie");
  const sends: Promise<void>[] = [];

  if (pixelId && metaToken) {
    const userData: Record<string, unknown> = { em: [sha256(input.email)] };
    const fbp = readCookieFromHeader(cookies, "_fbp");
    const fbc = readCookieFromHeader(cookies, "_fbc");
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    const body: Record<string, unknown> = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: order.id,
          action_source: "website",
          user_data: userData,
          custom_data: { value, currency: "USD", order_id: order.id, format, is_gift: order.isGift },
        },
      ],
    };
    const testCode = process.env.META_CAPI_TEST_EVENT_CODE?.trim();
    if (testCode) body.test_event_code = testCode;
    sends.push(
      post(
        `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(metaToken)}`,
        body,
        "meta",
        order.id,
      ),
    );
  }

  if (ga4Id && ga4Secret) {
    const params: Record<string, unknown> = {
      transaction_id: order.id,
      value,
      currency: "USD",
      format,
      is_gift: order.isGift,
    };
    if (process.env.ANALYTICS_DEBUG === "1") params.debug_mode = true;
    sends.push(
      post(
        `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(ga4Id)}&api_secret=${encodeURIComponent(ga4Secret)}`,
        { client_id: gaClientId(cookies), events: [{ name: "purchase", params }] },
        "ga4",
        order.id,
      ),
    );
  }

  await Promise.all(sends);
}

async function post(url: string, body: unknown, vendor: string, orderId: string): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) log("warn", "Server purchase event rejected", { vendor, orderId, status: res.status });
  } catch (e) {
    log("warn", "Server purchase event failed", { vendor, orderId, error: e instanceof Error ? e.message : String(e) });
  }
}
