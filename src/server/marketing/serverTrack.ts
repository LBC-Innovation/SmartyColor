import "server-only";
import { createHash, randomInt } from "node:crypto";
import { attributionFromRequest, readCookieFromHeader } from "@/lib/marketing/attribution";
import { intentFromAttributionCookie } from "@/lib/marketing/copy";
import { AD_OPT_OUT_COOKIE, centsToValue, trackFormatForProduct } from "@/lib/marketing/events";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/**
 * Server copies of the `purchase` event: Meta Conversions API, TikTok Events API and the GA4
 * Measurement Protocol. The browser sends the same event with the order id as its event id, so
 * Meta and TikTok keep one. Meta and TikTok get only a SHA-256 of the email plus their own
 * cookies and click ids; GA4 gets only its client id.
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
  const tiktokId = envId("NEXT_PUBLIC_TIKTOK_PIXEL_ID");
  const tiktokToken = process.env.TIKTOK_EVENTS_ACCESS_TOKEN?.trim();
  if (!(pixelId && metaToken) && !(ga4Id && ga4Secret) && !(tiktokId && tiktokToken)) return;

  const order = await loadOrder(input.orderId);
  if (!order) {
    log("warn", "Purchase not tracked: order missing or unpriced", { orderId: input.orderId });
    return;
  }
  const format = trackFormatForProduct(order.productId);
  const value = centsToValue(order.totalCents);
  const cookies = input.request.headers.get("cookie");
  // Which landing page the buyer's last ad click arrived on, read from the cm_attr cookie. No query.
  const intent = intentFromAttributionCookie(cookies);
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
          custom_data: { value, currency: "USD", order_id: order.id, format, is_gift: order.isGift, intent },
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

  if (tiktokId && tiktokToken) {
    const user: Record<string, unknown> = { email: sha256(input.email) };
    const ttp = readCookieFromHeader(cookies, "_ttp");
    // The ad click id, from the landing URL kept in cm_attr.
    const attribution = attributionFromRequest(input.request);
    const ttclid = attribution?.last.ttclid ?? attribution?.first.ttclid;
    if (ttp) user.ttp = ttp;
    if (ttclid) user.ttclid = ttclid;
    const userAgent = input.request.headers.get("user-agent");
    if (userAgent) user.user_agent = userAgent.slice(0, 400);
    const body: Record<string, unknown> = {
      event_source: "web",
      event_source_id: tiktokId,
      data: [
        {
          event: "CompletePayment",
          event_time: Math.floor(Date.now() / 1000),
          event_id: order.id,
          user,
          properties: {
            value,
            currency: "USD",
            content_type: "product",
            contents: [{ content_id: format, content_name: `${format} book`, quantity: 1 }],
            order_id: order.id,
          },
        },
      ],
    };
    const testCode = process.env.TIKTOK_TEST_EVENT_CODE?.trim();
    if (testCode) body.test_event_code = testCode;
    sends.push(
      post("https://business-api.tiktok.com/open_api/v1.3/event/track/", body, "tiktok", order.id, {
        "Access-Token": tiktokToken,
      }),
    );
  }

  if (ga4Id && ga4Secret) {
    const params: Record<string, unknown> = {
      transaction_id: order.id,
      value,
      currency: "USD",
      format,
      is_gift: order.isGift,
      intent,
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

async function post(
  url: string,
  body: unknown,
  vendor: string,
  orderId: string,
  extraHeaders: Record<string, string> = {},
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) log("warn", "Server purchase event rejected", { vendor, orderId, status: res.status });
    else if (vendor === "tiktok") {
      // TikTok answers 200 with a non-zero code for rejected events.
      const json = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
      if (json && json.code !== 0) log("warn", "Server purchase event rejected", { vendor, orderId, code: json.code, error: json.message });
    }
  } catch (e) {
    log("warn", "Server purchase event failed", { vendor, orderId, error: e instanceof Error ? e.message : String(e) });
  }
}
