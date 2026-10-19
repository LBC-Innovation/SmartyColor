import "server-only";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import { holidayOrderBy } from "@/lib/marketing/holiday";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import {
  holidayDeadlineEmail,
  orderConfirmedEmail,
  orderShippedEmail,
  reviewRequestEmail,
  unfinishedBookEmail,
  welcomeEmail,
} from "@/server/email/lifecycleEmails";
import { sendEmail, type OutgoingEmail } from "@/server/email/resend";
import { signToken } from "@/server/email/signedLinks";
import { libraryPaths, objectExists, signedReadUrls } from "@/server/storage/libraryFiles";

/**
 * Lifecycle emails (marketing plan M14). The daily cron calls `runLifecycleEmails`; order code
 * also calls `sendOrderEmails` right after a payment or printer status change so those don't wait
 * for the next run. Each email claims its (kind, ref_key) row in `email_sends` before it is sent,
 * so it goes out once per trigger however many times it is attempted.
 */

export type EmailKind =
  | "welcome"
  | "unfinished_book"
  | "holiday_deadline"
  | "order_confirmed"
  | "order_shipped"
  | "review_request";

const MARKETING: ReadonlySet<EmailKind> = new Set(["welcome", "unfinished_book", "holiday_deadline", "review_request"]);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Per kind per run; the next run picks up the rest. */
const BATCH = 200;
/** Cover links in the unfinished-book email stay valid this long. */
const COVER_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

export type SendOutcome = "sent" | "would_send" | "already_sent" | "opted_out" | "no_email" | "failed";
export type SendRecord = { kind: EmailKind; refKey: string; userId: string | null; outcome: SendOutcome };

export type RunOptions = {
  now?: Date;
  /** List what would go out without sending or recording anything. */
  dryRun?: boolean;
  /** Only consider this account (for testing against the live database). */
  userId?: string;
};

function db() {
  return getSupabaseAdmin();
}

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function unsubscribeLinks(userId: string): { unsubscribeUrl: string; oneClickUrl: string } {
  const t = encodeURIComponent(signToken("unsubscribe", userId));
  const origin = clientOrigin();
  return { unsubscribeUrl: `${origin}/unsubscribe?t=${t}`, oneClickUrl: `${origin}/api/email/unsubscribe?t=${t}` };
}

async function optedOut(userId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("profiles")
    .select("marketing_emails_opt_out_at, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // A missing profile (deleted account) or a suspended one gets no marketing mail.
  return !data || data.marketing_emails_opt_out_at != null || data.status === "suspended";
}

async function confirmedEmail(userId: string): Promise<string | null> {
  const { data, error } = await db().auth.admin.getUserById(userId);
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null;
  return data.user.email;
}

async function alreadyClaimed(kind: EmailKind, refKey: string): Promise<boolean> {
  const { data, error } = await db().from("email_sends").select("id").eq("kind", kind).eq("ref_key", refKey).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Sends one email at most once per (kind, refKey). The claim row goes in first; a failed hand-off
 * to Resend removes it so the next run retries, and a crash mid-send leaves it so nobody gets two.
 */
async function sendOnce(input: {
  kind: EmailKind;
  refKey: string;
  userId: string | null;
  /** Null: look up the account's confirmed address. */
  to: string | null;
  build: (to: string) => Promise<OutgoingEmail> | OutgoingEmail;
  dryRun?: boolean;
}): Promise<SendRecord> {
  const { kind, refKey, userId } = input;
  const record = (outcome: SendOutcome): SendRecord => ({ kind, refKey, userId, outcome });

  if (await alreadyClaimed(kind, refKey)) return record("already_sent");
  if (MARKETING.has(kind) && (!userId || (await optedOut(userId)))) return record("opted_out");

  const to = input.to ?? (userId ? await confirmedEmail(userId) : null);
  if (!to) return record("no_email");
  if (input.dryRun) return record("would_send");

  const { data: claim, error: claimError } = await db()
    .from("email_sends")
    .insert({ kind, ref_key: refKey, user_id: userId, to_email: to })
    .select("id")
    .single();
  if (claimError) {
    // 23505: another run claimed it between our check and insert.
    if (claimError.code === "23505") return record("already_sent");
    throw new Error(claimError.message);
  }

  let ok = false;
  try {
    ok = await sendEmail(await input.build(to));
  } catch (e) {
    log("error", "lifecycle email: build failed", { kind, refKey, error: e instanceof Error ? e.message : String(e) });
  }
  if (!ok) {
    await db().from("email_sends").delete().eq("id", claim.id);
    return record("failed");
  }
  await db().from("email_sends").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", claim.id);
  return record("sent");
}

/** Accounts with a draft book: newest cart with pages per user, no order paid since it was started. */
async function draftBooks(opts: { updatedBefore: number; updatedAfter: number; userId?: string }) {
  let q = db()
    .from("book_order_carts")
    .select("id, user_id, title, page_count, thumb_path, created_at, updated_at")
    .gt("page_count", 0)
    .lte("updated_at", iso(opts.updatedBefore))
    .gte("updated_at", iso(opts.updatedAfter))
    .order("updated_at", { ascending: false })
    .limit(BATCH * 2);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const newest = new Map<string, (typeof data)[number]>();
  for (const row of data ?? []) if (!newest.has(row.user_id as string)) newest.set(row.user_id as string, row);
  if (newest.size === 0) return [];

  const { data: paid, error: paidError } = await db()
    .from("book_orders")
    .select("user_id, paid_at")
    .in("user_id", [...newest.keys()])
    .not("paid_at", "is", null);
  if (paidError) throw new Error(paidError.message);
  const lastPaid = new Map<string, string>();
  for (const o of paid ?? []) {
    const prev = lastPaid.get(o.user_id as string);
    if (!prev || (o.paid_at as string) > prev) lastPaid.set(o.user_id as string, o.paid_at as string);
  }

  return [...newest.values()]
    .filter((cart) => {
      const p = lastPaid.get(cart.user_id as string);
      return !p || new Date(p).getTime() < new Date(cart.created_at as string).getTime();
    })
    .slice(0, BATCH);
}

async function runWelcome(now: number, opts: RunOptions): Promise<SendRecord[]> {
  // The welcome credit is settled when the email address is confirmed, so this is "confirmed in
  // the last three days"; older accounts never get a welcome.
  let q = db()
    .from("profiles")
    .select("id")
    .gte("welcome_credit_settled_at", iso(now - 3 * DAY_MS))
    .limit(BATCH);
  if (opts.userId) q = q.eq("id", opts.userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const out: SendRecord[] = [];
  for (const { id: userId } of data ?? []) {
    out.push(
      await sendOnce({
        kind: "welcome",
        refKey: userId as string,
        userId: userId as string,
        to: null,
        dryRun: opts.dryRun,
        build: async (to) => {
          const [{ data: grant }, { data: album }] = await Promise.all([
            db().from("credit_ledger").select("delta").eq("user_id", userId).eq("reason", "welcome_credit").limit(1).maybeSingle(),
            db().from("library_projects").select("id").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
          ]);
          const origin = clientOrigin();
          return welcomeEmail({
            to,
            // What this account was actually given, not today's setting.
            creditCents: (grant?.delta as number | undefined) ?? null,
            albumUrl: album ? `${origin}/studio?album=${encodeURIComponent(album.id as string)}` : `${origin}/studio`,
            ...unsubscribeLinks(userId as string),
          });
        },
      }),
    );
  }
  return out;
}

async function runUnfinishedBook(now: number, opts: RunOptions): Promise<SendRecord[]> {
  // Untouched for a day; carts abandoned more than two weeks ago are left alone.
  const carts = await draftBooks({ updatedBefore: now - DAY_MS, updatedAfter: now - 14 * DAY_MS, userId: opts.userId });
  const out: SendRecord[] = [];
  for (const cart of carts) {
    const userId = cart.user_id as string;
    out.push(
      await sendOnce({
        kind: "unfinished_book",
        refKey: cart.id as string,
        userId,
        to: null,
        dryRun: opts.dryRun,
        build: async (to) => {
          let coverUrl: string | null = null;
          const thumb = cart.thumb_path as string | null;
          if (thumb) {
            try {
              // The small copy is made after the fact; fall back to the page itself.
              const small = libraryPaths.thumb(thumb);
              const path = (await objectExists(small)) ? small : thumb;
              coverUrl = (await signedReadUrls([path], COVER_URL_TTL_SECONDS)).get(path) ?? null;
            } catch {
              // The email still works without the picture.
            }
          }
          return unfinishedBookEmail({
            to,
            title: cart.title as string,
            pageCount: cart.page_count as number,
            coverUrl,
            resumeUrl: `${clientOrigin()}/studio/order?cart=${encodeURIComponent(cart.id as string)}`,
            ...unsubscribeLinks(userId),
          });
        },
      }),
    );
  }
  return out;
}

/** Whole days from today to the order-by date, both in US Pacific time like the site banner. */
function daysUntil(isoDate: string, now: Date): number {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

async function runHolidayDeadline(now: Date, opts: RunOptions): Promise<SendRecord[]> {
  const orderBy = holidayOrderBy(now);
  if (!orderBy) return [];
  const daysLeft = daysUntil(orderBy.iso, now);
  // Two reminders: from 5 days out, then from 1 day out. A run that is missed still catches up.
  const stage = daysLeft <= 1 ? "1d" : daysLeft <= 5 ? "5d" : null;
  if (!stage) return [];

  const carts = await draftBooks({ updatedBefore: now.getTime(), updatedAfter: now.getTime() - 60 * DAY_MS, userId: opts.userId });
  const out: SendRecord[] = [];
  for (const cart of carts) {
    const userId = cart.user_id as string;
    out.push(
      await sendOnce({
        kind: "holiday_deadline",
        refKey: `${orderBy.iso}:${stage}:${userId}`,
        userId,
        to: null,
        dryRun: opts.dryRun,
        build: (to) =>
          holidayDeadlineEmail({
            to,
            dateLabel: orderBy.label,
            daysLeft,
            resumeUrl: `${clientOrigin()}/studio/order?cart=${encodeURIComponent(cart.id as string)}`,
            ...unsubscribeLinks(userId),
          }),
      }),
    );
  }
  return out;
}

const ORDER_COLUMNS =
  "id, user_id, project_title, page_count, status, fulfillment, total_cents, contact_email, carrier, tracking_number, tracking_urls, paid_at, shipped_at, delivered_at, deleted_at";

type OrderRow = {
  id: string;
  user_id: string;
  project_title: string | null;
  page_count: number;
  status: string;
  fulfillment: string | null;
  total_cents: number | null;
  contact_email: string;
  carrier: string | null;
  tracking_number: string | null;
  tracking_urls: unknown;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  deleted_at: string | null;
};

const NO_MAIL_STATUSES = new Set(["draft", "quoted", "awaiting_payment", "canceled", "refunded"]);

function orderUrl(id: string): string {
  return `${clientOrigin()}/orders/${encodeURIComponent(id)}`;
}

/** Order confirmed and shipped for one order, each when its moment has come and not sent yet. */
async function orderEmailsFor(order: OrderRow, now: number, dryRun?: boolean): Promise<SendRecord[]> {
  const out: SendRecord[] = [];
  if (order.deleted_at || NO_MAIL_STATUSES.has(order.status)) return out;
  const to = order.contact_email?.trim() || null;
  const digital = order.fulfillment === "digital";

  // Older orders predate these emails; only recent payments and shipments are announced.
  if (order.paid_at && new Date(order.paid_at).getTime() >= now - 3 * DAY_MS) {
    out.push(
      await sendOnce({
        kind: "order_confirmed",
        refKey: order.id,
        userId: order.user_id,
        to,
        dryRun,
        build: (address) =>
          orderConfirmedEmail({
            to: address,
            title: order.project_title,
            pageCount: order.page_count,
            totalCents: order.total_cents,
            digital,
            orderUrl: orderUrl(order.id),
          }),
      }),
    );
  }

  if (!digital && order.shipped_at && new Date(order.shipped_at).getTime() >= now - 7 * DAY_MS) {
    const urls = Array.isArray(order.tracking_urls) ? order.tracking_urls.filter((u): u is string => typeof u === "string") : [];
    out.push(
      await sendOnce({
        kind: "order_shipped",
        refKey: order.id,
        userId: order.user_id,
        to,
        dryRun,
        build: (address) =>
          orderShippedEmail({
            to: address,
            title: order.project_title,
            carrier: order.carrier,
            trackingNumber: order.tracking_number,
            trackingUrl: urls[0] ?? null,
            orderUrl: orderUrl(order.id),
          }),
      }),
    );
  }
  return out;
}

/** Called by order code after a payment or printer status change. Never throws. */
export async function sendOrderEmails(orderId: string): Promise<void> {
  try {
    const { data, error } = await db().from("book_orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return;
    const sent = await orderEmailsFor(data as OrderRow, Date.now());
    if (sent.some((r) => r.outcome === "failed")) log("warn", "order email failed; the cron will retry", { orderId });
  } catch (e) {
    log("error", "order emails failed", { orderId, error: e instanceof Error ? e.message : String(e) });
  }
}

async function runOrderEmails(now: number, opts: RunOptions): Promise<SendRecord[]> {
  // Backstop for the direct calls: anything paid or shipped lately that has no email yet.
  const since = iso(now - 7 * DAY_MS);
  let q = db()
    .from("book_orders")
    .select(ORDER_COLUMNS)
    .is("deleted_at", null)
    .or(`paid_at.gte.${since},shipped_at.gte.${since}`)
    .limit(BATCH);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const out: SendRecord[] = [];
  for (const order of (data ?? []) as OrderRow[]) out.push(...(await orderEmailsFor(order, now, opts.dryRun)));
  return out;
}

/**
 * Lulu reports shipping but rarely delivery, so when there is no delivery date a book counts as
 * delivered a week after it shipped. The ask goes out a week after that, within a two-week window.
 */
async function runReviewRequest(now: number, opts: RunOptions): Promise<SendRecord[]> {
  let q = db()
    .from("book_orders")
    .select(ORDER_COLUMNS)
    .is("deleted_at", null)
    .eq("fulfillment", "print")
    .in("status", ["shipped", "delivered"])
    .gte("shipped_at", iso(now - 35 * DAY_MS))
    .limit(BATCH);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const out: SendRecord[] = [];
  for (const order of (data ?? []) as OrderRow[]) {
    if (!order.shipped_at) continue;
    const delivered = order.delivered_at ? new Date(order.delivered_at).getTime() : new Date(order.shipped_at).getTime() + 7 * DAY_MS;
    const due = delivered + 7 * DAY_MS;
    if (now < due || now >= due + 14 * DAY_MS) continue;
    out.push(
      await sendOnce({
        kind: "review_request",
        refKey: order.id,
        userId: order.user_id,
        to: order.contact_email?.trim() || null,
        dryRun: opts.dryRun,
        build: (to) =>
          reviewRequestEmail({
            to,
            title: order.project_title,
            feedbackUrl: `${clientOrigin()}/feedback?t=${encodeURIComponent(signToken("feedback", order.id))}`,
            ...unsubscribeLinks(order.user_id),
          }),
      }),
    );
  }
  return out;
}

export type RunSummary = {
  dryRun: boolean;
  counts: Record<EmailKind, Partial<Record<SendOutcome, number>>>;
  records: SendRecord[];
  errors: Array<{ kind: EmailKind; message: string }>;
};

export async function runLifecycleEmails(opts: RunOptions = {}): Promise<RunSummary> {
  const now = opts.now ?? new Date();
  const ms = now.getTime();
  const jobs: Array<[EmailKind, () => Promise<SendRecord[]>]> = [
    ["order_confirmed", () => runOrderEmails(ms, opts)],
    ["welcome", () => runWelcome(ms, opts)],
    ["unfinished_book", () => runUnfinishedBook(ms, opts)],
    ["holiday_deadline", () => runHolidayDeadline(now, opts)],
    ["review_request", () => runReviewRequest(ms, opts)],
  ];

  const records: SendRecord[] = [];
  const errors: RunSummary["errors"] = [];
  // One at a time: a failing kind is reported and the others still run.
  for (const [kind, job] of jobs) {
    try {
      records.push(...(await job()));
    } catch (e) {
      errors.push({ kind, message: e instanceof Error ? e.message : String(e) });
    }
  }

  const counts = {} as RunSummary["counts"];
  for (const r of records) {
    const bucket = (counts[r.kind] ??= {});
    bucket[r.outcome] = (bucket[r.outcome] ?? 0) + 1;
  }
  log(errors.length ? "error" : "info", "lifecycle emails run", { dryRun: Boolean(opts.dryRun), counts, errors });
  return { dryRun: Boolean(opts.dryRun), counts, records, errors };
}
