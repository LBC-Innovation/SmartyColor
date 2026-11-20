import "server-only";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import { DIGITAL_FORMAT } from "@/lib/print/bookBindings";
import { getSupabaseAdmin, getSupabaseAuth } from "@/lib/supabase/service";
import { referralCreditEmail, reviewRequestEmail, unfinishedBookEmail } from "@/server/email/lifecycleEmails";
import { emailConfigured, sendEmail, type OutgoingEmail } from "@/server/email/resend";
import { unsubscribeUrls } from "@/server/marketing/unsubscribe";

/**
 * The daily follow-up job (/api/cron/lifecycle-emails):
 *  - unfinished_book: a book started 1–7 days ago and not ordered since. At most one every 14 days.
 *  - review_request: once per account, 2 days after a book is delivered (10 days after it ships
 *    when no delivery date comes back, 3 days after a digital order). Needs REVIEW_URL.
 *  - referral_credit: tells the sharer their friend's sign-up earned them credit.
 * Each email is claimed in lifecycle_emails before sending, so a rerun never sends twice.
 * Accounts that unsubscribed get neither reminders nor review requests.
 */

const DAY_MS = 86_400_000;
const MAX_PER_KIND = 200;
const NOT_SOLD = ["canceled", "refunded", "failed"];

type Kind = "unfinished_book" | "review_request" | "referral_credit";
type Summary = Record<Kind, { sent: number; skipped: number; failed: number }>;

function db() {
  return getSupabaseAdmin();
}

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

async function emailOf(userId: string, cache: Map<string, string | null>): Promise<string | null> {
  if (cache.has(userId)) return cache.get(userId)!;
  const { data } = await getSupabaseAuth().auth.admin.getUserById(userId).catch(() => ({ data: null }));
  const email = data?.user?.email ?? null;
  cache.set(userId, email);
  return email;
}

async function optedOut(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data } = await db().from("profiles").select("id").in("id", userIds).eq("marketing_emails_opt_out", true);
  return new Set((data ?? []).map((r) => r.id as string));
}

/** Claim, then send; a failed send releases the claim so tomorrow's run retries. */
async function claimAndSend(kind: Kind, userId: string, refId: string, message: OutgoingEmail): Promise<"sent" | "skipped" | "failed"> {
  const { error } = await db().from("lifecycle_emails").insert({ kind, user_id: userId, ref_id: refId });
  if (error) return error.code === "23505" ? "skipped" : "failed";
  const ok = await sendEmail(message);
  if (!ok) {
    await db().from("lifecycle_emails").delete().eq("kind", kind).eq("ref_id", refId);
    return "failed";
  }
  return "sent";
}

async function unfinishedBooks(summary: Summary, emails: Map<string, string | null>) {
  const { data: carts, error } = await db()
    .from("book_order_carts")
    .select("id, user_id, title, page_count, updated_at")
    .gt("page_count", 0)
    .lte("updated_at", ago(1))
    .gte("updated_at", ago(7))
    .order("updated_at", { ascending: false })
    .limit(MAX_PER_KIND);
  if (error) throw new Error(error.message);
  const rows = carts ?? [];
  const users = [...new Set(rows.map((c) => c.user_id as string))];
  const blocked = await optedOut(users);

  // Reminded recently, or ordered since starting the cart.
  const { data: recent } = await db().from("lifecycle_emails").select("user_id").eq("kind", "unfinished_book").in("user_id", users).gte("sent_at", ago(14));
  const remindedRecently = new Set((recent ?? []).map((r) => r.user_id as string));
  const { data: paid } = await db()
    .from("book_orders")
    .select("user_id, paid_at")
    .in("user_id", users)
    .not("paid_at", "is", null)
    .gte("paid_at", ago(8));
  const lastPaid = new Map<string, number>();
  for (const p of paid ?? []) lastPaid.set(p.user_id as string, Math.max(lastPaid.get(p.user_id as string) ?? 0, Date.parse(p.paid_at as string)));

  const done = new Set<string>();
  for (const cart of rows) {
    const uid = cart.user_id as string;
    if (done.has(uid) || blocked.has(uid) || remindedRecently.has(uid) || (lastPaid.get(uid) ?? 0) >= Date.parse(cart.updated_at as string)) {
      summary.unfinished_book.skipped++;
      continue;
    }
    done.add(uid);
    const to = await emailOf(uid, emails);
    if (!to) {
      summary.unfinished_book.skipped++;
      continue;
    }
    const url = `${clientOrigin()}/studio?cart=${encodeURIComponent(cart.id as string)}&book=open&utm_source=lifecycle&utm_medium=email&utm_campaign=unfinished_book`;
    const result = await claimAndSend(
      "unfinished_book",
      uid,
      cart.id as string,
      unfinishedBookEmail({ to, bookTitle: (cart.title as string) ?? "", pageCount: (cart.page_count as number) ?? 0, url, unsubscribe: unsubscribeUrls(uid) }),
    );
    summary.unfinished_book[result]++;
  }
}

async function reviewRequests(summary: Summary, emails: Map<string, string | null>) {
  const reviewUrl = process.env.REVIEW_URL?.trim();
  if (!reviewUrl || !/^https:\/\//.test(reviewUrl)) return;

  const { data: orders, error } = await db()
    .from("book_orders")
    .select("id, user_id, product_id, status, paid_at, shipped_at, delivered_at")
    .not("paid_at", "is", null)
    .gte("paid_at", ago(60))
    .not("status", "in", `(${NOT_SOLD.join(",")})`)
    .order("paid_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);

  const now = Date.now();
  const ready = (orders ?? []).filter((o) => {
    const digital = o.product_id === DIGITAL_FORMAT.productId;
    if (digital) return now - Date.parse(o.paid_at as string) >= 3 * DAY_MS;
    if (o.delivered_at) return now - Date.parse(o.delivered_at as string) >= 2 * DAY_MS;
    if (o.shipped_at) return now - Date.parse(o.shipped_at as string) >= 10 * DAY_MS;
    return false;
  });
  const users = [...new Set(ready.map((o) => o.user_id as string))];
  if (users.length === 0) return;
  const blocked = await optedOut(users);
  const { data: asked } = await db().from("lifecycle_emails").select("user_id").eq("kind", "review_request").in("user_id", users);
  const alreadyAsked = new Set((asked ?? []).map((r) => r.user_id as string));

  let sentCount = 0;
  const done = new Set<string>();
  for (const o of ready) {
    const uid = o.user_id as string;
    if (sentCount >= MAX_PER_KIND) break;
    if (done.has(uid) || blocked.has(uid) || alreadyAsked.has(uid)) {
      summary.review_request.skipped++;
      continue;
    }
    done.add(uid);
    const to = await emailOf(uid, emails);
    if (!to) {
      summary.review_request.skipped++;
      continue;
    }
    const result = await claimAndSend(
      "review_request",
      uid,
      o.id as string,
      reviewRequestEmail({ to, digital: o.product_id === DIGITAL_FORMAT.productId, reviewUrl, unsubscribe: unsubscribeUrls(uid) }),
    );
    if (result === "sent") sentCount++;
    summary.review_request[result]++;
  }
}

async function referralCredits(summary: Summary, emails: Map<string, string | null>) {
  const { data: credits, error } = await db()
    .from("referral_credits")
    .select("referred_user_id, referrer_id, amount_cents, created_at")
    .gte("created_at", ago(3))
    .gt("amount_cents", 0)
    .not("referrer_id", "is", null)
    .limit(MAX_PER_KIND);
  if (error) throw new Error(error.message);
  for (const c of credits ?? []) {
    const uid = c.referrer_id as string;
    const to = await emailOf(uid, emails);
    if (!to) {
      summary.referral_credit.skipped++;
      continue;
    }
    const result = await claimAndSend(
      "referral_credit",
      uid,
      c.referred_user_id as string,
      referralCreditEmail({ to, amountCents: c.amount_cents as number, url: `${clientOrigin()}/share?utm_source=lifecycle&utm_medium=email&utm_campaign=referral_credit` }),
    );
    summary.referral_credit[result]++;
  }
}

export async function runLifecycleEmails(): Promise<Summary> {
  const summary: Summary = {
    unfinished_book: { sent: 0, skipped: 0, failed: 0 },
    review_request: { sent: 0, skipped: 0, failed: 0 },
    referral_credit: { sent: 0, skipped: 0, failed: 0 },
  };
  if (process.env.NODE_ENV === "production" && !emailConfigured()) {
    log("warn", "lifecycle emails skipped: email not configured");
    return summary;
  }
  if (process.env.LIFECYCLE_EMAILS_ENABLED?.trim() !== "1") {
    log("info", "lifecycle emails skipped: LIFECYCLE_EMAILS_ENABLED is not 1");
    return summary;
  }
  const emails = new Map<string, string | null>();
  for (const [name, job] of [
    ["unfinished_book", unfinishedBooks],
    ["review_request", reviewRequests],
    ["referral_credit", referralCredits],
  ] as const) {
    try {
      await job(summary, emails);
    } catch (e) {
      log("error", "lifecycle email job failed", { job: name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  log("info", "lifecycle emails ran", summary);
  return summary;
}

/** Unsubscribe from reminders and review requests. */
export async function optOutOfMarketingEmails(userId: string): Promise<boolean> {
  const { error } = await db().from("profiles").update({ marketing_emails_opt_out: true }).eq("id", userId);
  if (error) log("warn", "unsubscribe failed", { userId, error: error.message });
  return !error;
}
