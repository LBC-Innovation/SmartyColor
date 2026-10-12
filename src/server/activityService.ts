import "server-only";
import type { ApiResult } from "@/lib/api/types";
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityCategory,
  type ActivityEntry,
  type ActivityFilter,
  type ActivityPage,
  type ActivityType,
} from "@/lib/activity/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { getStripe } from "@/server/stripe/client";
import { stripeConfigured } from "@/server/stripe/config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

/** “name” for descriptions, or the fallback when there is no name to show. */
export function quoted(name: string | null | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed ? `“${trimmed}”` : fallback;
}

/**
 * Add an entry to a user's history. Best effort: the action it describes has
 * already happened, so a logging failure must never fail it.
 * Wallet changes are not recorded here; the credit_ledger trigger mirrors them.
 */
export async function recordActivity(input: {
  userId: string;
  category: ActivityCategory;
  type: ActivityType;
  description: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from("account_activity").insert({
      user_id: input.userId,
      category: input.category,
      type: input.type,
      description: input.description,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    log("warn", "Activity could not be recorded", {
      userId: input.userId,
      type: input.type,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function listActivityForUser(
  userId: string,
  options: ActivityFilter & { offset?: number; limit?: number } = {},
): Promise<ApiResult<ActivityPage>> {
  const limit = Math.min(Math.max(options.limit ?? ACTIVITY_PAGE_SIZE, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  let query = getSupabaseAdmin()
    .from("account_activity")
    .select(
      "id, category, type, description, amount_cents, balance_after_cents, stripe_checkout_session_id, reference_type, reference_id, occurred_at",
    )
    .eq("user_id", userId);
  if (options.category) query = query.eq("category", options.category);
  if (options.type) query = query.eq("type", options.type);
  if (options.moneyOnly) query = query.not("amount_cents", "is", null);

  // One extra row tells us whether there is another page.
  const { data, error } = await query
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (error) return { data: null, error: { message: error.message } };

  const rows = data ?? [];
  const items: ActivityEntry[] = rows.slice(0, limit).map((row) => ({
    id: row.id as string,
    category: row.category as ActivityCategory,
    type: row.type as string,
    description: row.description as string,
    amountCents: (row.amount_cents as number | null) ?? null,
    balanceAfterCents: (row.balance_after_cents as number | null) ?? null,
    occurredAt: row.occurred_at as string,
    hasReceipt: Boolean(row.stripe_checkout_session_id),
    orderId: row.reference_type === "book_order" ? ((row.reference_id as string | null) ?? null) : null,
  }));
  return { data: { items, hasMore: rows.length > limit }, error: null };
}

/** Stripe's hosted receipt for a card top-up in the user's own history. */
export async function getActivityReceiptUrl(
  userId: string,
  activityId: string,
): Promise<ApiResult<{ url: string }>> {
  const notFound = { data: null, error: { message: "No receipt for this transaction", code: "NOT_FOUND" } };
  if (!UUID_RE.test(activityId)) return notFound;

  const { data, error } = await getSupabaseAdmin()
    .from("account_activity")
    .select("stripe_checkout_session_id")
    .eq("id", activityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  const sessionId = data?.stripe_checkout_session_id as string | null | undefined;
  if (!sessionId) return notFound;
  if (!stripeConfigured()) {
    return { data: null, error: { message: "Receipts are not available right now", code: "STRIPE_NOT_CONFIGURED" } };
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.latest_charge"],
    });
    const intent = session.payment_intent;
    const charge = intent && typeof intent === "object" ? intent.latest_charge : null;
    const url = charge && typeof charge === "object" ? charge.receipt_url : null;
    if (!url) {
      return { data: null, error: { message: "Stripe has not issued a receipt for this payment yet" } };
    }
    return { data: { url }, error: null };
  } catch (e) {
    log("error", "Stripe receipt lookup failed", {
      userId,
      activityId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { data: null, error: { message: "Could not get the receipt from Stripe. Please try again." } };
  }
}
