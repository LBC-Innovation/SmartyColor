import "server-only";
import type Stripe from "stripe";
import type { ApiResult } from "@/lib/api/types";
import type { HistoryEvent, HistoryTone, UserHistory } from "@/lib/admin/userHistory";
import { historyMoney } from "@/lib/admin/userHistory";
import { pageViewLabel } from "@/lib/activity/pageViews";
import { getSupabaseAdmin, getSupabaseAuth } from "@/lib/supabase/service";
import { getStripe } from "@/server/stripe/client";
import { stripeConfigured } from "@/server/stripe/config";

/** Plenty for any real customer; the drawer says so when there is more. */
const ACTIVITY_LIMIT = 2000;
const STRIPE_SESSION_LIMIT = 100;

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

const ACTIVITY_TONE: Record<string, HistoryTone> = {
  funds_added: "good",
  credit_granted: "good",
  refund: "good",
  book_package_refund: "good",
  book_ordered: "good",
  digital_book_ordered: "good",
  book_package: "good",
  order_canceled: "warn",
  credit_removed: "warn",
  album_deleted: "warn",
  photo_deleted: "warn",
};

const OPERATION_LABEL: Record<string, string> = {
  photoToColoring: "making a coloring page",
  correctPhotoColoring: "editing a coloring page",
  photoToPortrait: "making a portrait version",
  generateImage: "making an image",
  refine: "refining a page",
  storybookPhotoChat: "the photo chat",
  storybookGenerate: "writing the story",
};

const ERROR_KIND_LABEL: Record<string, string> = {
  safety: "blocked by the AI safety filter",
  billing: "our AI account had a billing problem",
  quota: "our AI quota ran out",
  auth: "our AI key was rejected",
};

async function appEvents(userId: string): Promise<ApiResult<{ events: HistoryEvent[]; truncated: boolean; email: string | null }>> {
  const db = getSupabaseAdmin();
  const [authUser, activity, errors, carts, orders, views] = await Promise.all([
    getSupabaseAuth().auth.admin.getUserById(userId),
    db
      .from("account_activity")
      .select("id, type, description, amount_cents, balance_after_cents, occurred_at")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(ACTIVITY_LIMIT + 1),
    db
      .from("vision_error_events")
      .select("id, at, operation, kind")
      .eq("user_id", userId)
      .order("at", { ascending: false })
      .limit(500),
    db.from("book_order_carts").select("id, title, created_at").eq("user_id", userId),
    db.from("book_orders").select("id, project_title, shipped_at, delivered_at").eq("user_id", userId),
    db
      .from("page_views")
      .select("id, path, at")
      .eq("user_id", userId)
      .order("at", { ascending: false })
      .limit(ACTIVITY_LIMIT + 1),
  ]);
  if (authUser.error || !authUser.data.user) {
    return { data: null, error: { message: authUser.error?.message ?? "User not found", code: "NOT_FOUND" } };
  }
  if (activity.error) return { data: null, error: { message: activity.error.message } };

  const user = authUser.data.user;
  const events: HistoryEvent[] = [
    {
      id: `signup-${user.id}`,
      at: user.created_at,
      type: "signup",
      description: "Signed up",
      amountCents: null,
      balanceAfterCents: null,
      tone: "neutral",
      source: "account",
    },
  ];
  if (user.email_confirmed_at && user.email_confirmed_at !== user.created_at) {
    events.push({
      id: `verified-${user.id}`,
      at: user.email_confirmed_at,
      type: "email_verified",
      description: "Verified their email",
      amountCents: null,
      balanceAfterCents: null,
      tone: "neutral",
      source: "account",
    });
  }
  if (user.last_sign_in_at) {
    events.push({
      id: `signin-${user.id}`,
      at: user.last_sign_in_at,
      type: "sign_in",
      description: "Last signed in (earlier sign-ins aren't kept)",
      amountCents: null,
      balanceAfterCents: null,
      tone: "neutral",
      source: "account",
    });
  }

  const activityRows = activity.data ?? [];
  for (const row of activityRows.slice(0, ACTIVITY_LIMIT)) {
    events.push({
      id: row.id as string,
      at: row.occurred_at as string,
      type: row.type as string,
      description: row.description as string,
      amountCents: (row.amount_cents as number | null) ?? null,
      balanceAfterCents: (row.balance_after_cents as number | null) ?? null,
      tone: ACTIVITY_TONE[row.type as string] ?? "neutral",
      source: "app",
    });
  }

  const viewRows = views.data ?? [];
  for (const row of viewRows.slice(0, ACTIVITY_LIMIT)) {
    events.push({
      id: row.id as string,
      at: row.at as string,
      type: "page_view",
      description: `Opened ${pageViewLabel(row.path as string)}`,
      amountCents: null,
      balanceAfterCents: null,
      tone: "neutral",
      source: "app",
    });
  }

  for (const row of errors.data ?? []) {
    const what = OPERATION_LABEL[row.operation as string] ?? "using AI";
    const why = ERROR_KIND_LABEL[row.kind as string];
    events.push({
      id: row.id as string,
      at: row.at as string,
      type: "ai_error",
      description: `Hit an error ${what}${why ? `: ${why}` : ""}`,
      amountCents: null,
      balanceAfterCents: null,
      tone: "bad",
      source: "app",
    });
  }

  for (const row of carts.data ?? []) {
    events.push({
      id: `cart-${row.id}`,
      at: row.created_at as string,
      type: "book_started",
      description: `Started designing a book${row.title ? ` “${row.title}”` : ""}`,
      amountCents: null,
      balanceAfterCents: null,
      tone: "neutral",
      source: "app",
    });
  }

  for (const row of orders.data ?? []) {
    const name = row.project_title ? ` “${row.project_title}”` : "";
    if (row.shipped_at) {
      events.push({
        id: `shipped-${row.id}`,
        at: row.shipped_at as string,
        type: "book_shipped",
        description: `Book${name} shipped`,
        amountCents: null,
        balanceAfterCents: null,
        tone: "good",
        source: "app",
      });
    }
    if (row.delivered_at) {
      events.push({
        id: `delivered-${row.id}`,
        at: row.delivered_at as string,
        type: "book_delivered",
        description: `Book${name} delivered`,
        amountCents: null,
        balanceAfterCents: null,
        tone: "good",
        source: "app",
      });
    }
  }

  return { data: { events, truncated: activityRows.length > ACTIVITY_LIMIT || viewRows.length > ACTIVITY_LIMIT, email: user.email ?? null }, error: null };
}

function checkoutWhat(session: Stripe.Checkout.Session): string {
  const kind = session.metadata?.purpose === "credit_topup" ? "wallet top-up" : "book package";
  return `${historyMoney(session.amount_total ?? 0)} ${kind}`;
}

function declineText(charge: Stripe.Charge): string {
  const outcome = charge.outcome;
  if (outcome?.type === "issuer_declined") return "declined by their bank";
  if (outcome?.type === "blocked") return "blocked by Stripe's fraud check";
  return charge.failure_message ? `failed: ${charge.failure_message}` : "failed";
}

/**
 * Card checkouts that never became money: the ones they backed out of and the declines. Paid
 * checkouts are already in the app's own log, so only a paid top-up that never reached the
 * wallet is shown from here.
 */
async function stripeEvents(userId: string, email: string, since: string): Promise<HistoryEvent[]> {
  const stripe = getStripe();
  const sessions: Stripe.Checkout.Session[] = [];
  for await (const s of stripe.checkout.sessions.list({
    customer_details: { email },
    created: { gte: Math.floor(new Date(since).getTime() / 1000) - 86_400 },
    limit: 100,
    expand: ["data.payment_intent"],
  })) {
    const owner = s.metadata?.userId ?? s.metadata?.user_id;
    if (owner === userId) sessions.push(s);
    if (sessions.length >= STRIPE_SESSION_LIMIT) break;
  }
  if (sessions.length === 0) return [];

  const topUpIds = sessions.filter((s) => s.metadata?.purpose === "credit_topup").map((s) => s.id);
  const { data: credited } = topUpIds.length
    ? await getSupabaseAdmin()
        .from("credit_stripe_sessions")
        .select("stripe_checkout_session_id")
        .in("stripe_checkout_session_id", topUpIds)
    : { data: [] };
  const creditedIds = new Set((credited ?? []).map((r) => r.stripe_checkout_session_id as string));

  const events: HistoryEvent[] = [];
  await Promise.all(
    sessions.map(async (s) => {
      const what = checkoutWhat(s);
      const at = new Date(s.created * 1000).toISOString();
      const base = { amountCents: null, balanceAfterCents: null, source: "stripe" as const };
      const intent = s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent : null;
      const charges = intent ? (await stripe.charges.list({ payment_intent: intent.id, limit: 20 })).data : [];
      const failed = charges.filter((c) => c.status === "failed");

      for (const c of failed) {
        events.push({
          ...base,
          id: c.id,
          at: new Date(c.created * 1000).toISOString(),
          type: "checkout_declined",
          description: `${what}: ${declineText(c)}`,
          tone: "bad",
        });
      }

      if (s.payment_status === "paid") {
        if (s.metadata?.purpose === "credit_topup" && !creditedIds.has(s.id)) {
          events.push({
            ...base,
            id: s.id,
            at,
            type: "checkout_uncredited",
            description: `${what} was paid but never added to the wallet`,
            tone: "bad",
          });
        }
        return;
      }
      if (failed.length > 0) return;
      events.push({
        ...base,
        id: s.id,
        at,
        type: "checkout_abandoned",
        description:
          s.status === "open"
            ? `Opened a ${what} checkout and hasn't paid`
            : `Opened a ${what} checkout, then left without paying`,
        tone: "warn",
      });
    }),
  );
  return events;
}

export async function getUserHistory(userId: string): Promise<ApiResult<UserHistory>> {
  const app = await appEvents(userId);
  if (app.error) return app;
  const { events, truncated, email } = app.data!;
  const signup = events[0].at;

  let stripe: UserHistory["stripe"] = "ok";
  if (!stripeConfigured()) stripe = "not_configured";
  else if (email) {
    try {
      events.push(...(await stripeEvents(userId, email, signup)));
    } catch (e) {
      stripe = "error";
      log("error", "Stripe history lookup failed", { userId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Sources format timestamps differently (Z vs +00:00), so compare instants, not strings.
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
  return { data: { events, stripe, truncated }, error: null };
}
