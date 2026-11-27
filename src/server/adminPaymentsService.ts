import "server-only";
import type Stripe from "stripe";
import type { ApiResult } from "@/lib/api/types";
import { isPrintBindingId, getBookBinding } from "@/lib/print/bookBindings";
import type {
  CardChargeDetails,
  CardChargeInfo,
  CardRefundRequest,
  CardRefundResult,
  PackageInfo,
  PaymentEntry,
  PaymentKind,
  UserPayments,
} from "@/lib/payments/types";
import { getSupabaseAdmin, getSupabaseAuth as getSupabaseAuthAdmin } from "@/lib/supabase/service";
import { getStripe } from "@/server/stripe/client";
import { stripeConfigured } from "@/server/stripe/config";
import { paymentReceiptEmail } from "@/server/email/paymentReceiptEmail";
import { sendEmail } from "@/server/email/resend";

/**
 * One customer's money in one place: the wallet ledger, card top-ups, book packages paid by card
 * and refunds to a card. Wallet and card lines sit in the same list, tagged by channel, so an admin
 * never has to look in two places to see what someone has paid.
 */

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

const db = () => getSupabaseAdmin();

/** Ledger reasons that move free or card money into the wallet, or undo that: not purchases. */
export const FUNDING_REASONS = new Set([
  "stripe_purchase",
  "admin_grant",
  "welcome_credit",
  "referral_credit",
  "card_refund",
  "card_refund_reversal",
]);
const GRANT_REASONS = new Set(["admin_grant", "welcome_credit", "referral_credit"]);
const USAGE_REASONS = new Set(["sheet_generation", "sheet_edit", "photo_portrait"]);
const PURCHASE_REASONS = new Set(["order_payment", "digital_book_payment", "book_package"]);
const REFUND_REASONS = new Set(["order_refund", "usage_refund", "book_package_refund"]);

const USAGE_NOUN: Record<string, [string, string]> = {
  sheet_generation: ["coloring page", "coloring pages"],
  sheet_edit: ["touch-up", "touch-ups"],
  photo_portrait: ["portrait", "portraits"],
};

type LedgerRow = {
  id: string;
  delta: number;
  balance_after: number;
  reason: string;
  note: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
};

type SessionRow = { stripe_checkout_session_id: string; amount_cents: number; credited_at: string };

type PackageRow = {
  id: string;
  binding_id: string;
  status: "active" | "void";
  project_id: string | null;
  book_order_id: string | null;
  refunded_at: string | null;
  package_price_cents: number | null;
  shipping_prepaid_cents: number | null;
  stripe_session_id: string | null;
  paid_with: string | null;
  created_at: string;
};

type RefundRow = {
  id: string;
  stripe_checkout_session_id: string;
  kind: "wallet_topup" | "book_package";
  purchase_code_id: string | null;
  amount_cents: number;
  cancels_package: boolean;
  status: "pending" | "succeeded" | "failed";
  note: string | null;
  error: string | null;
  created_at: string;
};

function bindingName(id: string | null | undefined): string {
  return id && isPrintBindingId(id) ? getBookBinding(id).shortLabel : "book";
}

function packageLabel(row: Pick<PackageRow, "binding_id" | "shipping_prepaid_cents">): string {
  const ship = (row.shipping_prepaid_cents ?? 0) > 0 ? " with shipping" : "";
  return `Book package (${bindingName(row.binding_id).toLowerCase()})${ship}`;
}

async function fetchLedger(userId: string): Promise<LedgerRow[]> {
  const rows: LedgerRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data, error } = await db()
      .from("credit_ledger")
      .select("id, delta, balance_after, reason, note, reference_type, reference_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as LedgerRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** card_refunds arrives with migration 0050; until then there are simply no card refunds. */
async function fetchRefunds(userId: string): Promise<RefundRow[]> {
  const { data, error } = await db()
    .from("card_refunds")
    .select("id, stripe_checkout_session_id, kind, purchase_code_id, amount_cents, cancels_package, status, note, error, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    log("warn", "card refunds unavailable", { error: error.message });
    return [];
  }
  return (data ?? []) as RefundRow[];
}

async function sheetPriceCents(): Promise<number> {
  const { data } = await db()
    .from("price_items")
    .select("list_price_cents, billable")
    .eq("sku", "ai.sheet_generation")
    .maybeSingle();
  const row = data as { list_price_cents: number | null; billable: boolean } | null;
  return row?.billable ? Number(row.list_price_cents ?? 0) : 0;
}

export async function listUserPayments(userId: string): Promise<ApiResult<UserPayments>> {
  try {
    const [ledger, sessionsRes, packagesRes, refunds, profileRes] = await Promise.all([
      fetchLedger(userId),
      db()
        .from("credit_stripe_sessions")
        .select("stripe_checkout_session_id, amount_cents, credited_at")
        .eq("user_id", userId),
      db()
        .from("purchase_codes")
        .select(
          "id, binding_id, status, project_id, book_order_id, refunded_at, package_price_cents, shipping_prepaid_cents, stripe_session_id, paid_with, created_at, pages_used, pages_brought_in",
        )
        .eq("source", "package")
        .or(`redeemed_by.eq.${userId},created_by.eq.${userId}`),
      fetchRefunds(userId),
      db().from("profiles").select("credits_balance").eq("id", userId).maybeSingle(),
    ]);
    if (sessionsRes.error) throw new Error(sessionsRes.error.message);
    if (packagesRes.error) throw new Error(packagesRes.error.message);

    const balanceCents = Number((profileRes.data as { credits_balance?: number } | null)?.credits_balance ?? 0);
    const sessions = (sessionsRes.data ?? []) as SessionRow[];
    const packages = (packagesRes.data ?? []) as Array<PackageRow & { pages_used: number; pages_brought_in: number }>;
    const packageById = new Map(packages.map((p) => [p.id, p]));
    const cardPackages = packages.filter((p) => p.paid_with === "card" && p.stripe_session_id && (p.package_price_cents ?? 0) > 0);

    // Album and book names for the lines that point at them.
    const orderIds = [
      ...new Set(
        ledger
          .filter((l) => l.reference_id && (l.reason === "order_payment" || l.reason === "order_refund" || l.reason === "digital_book_payment"))
          .map((l) => l.reference_id as string),
      ),
    ];
    const projectIds = [...new Set(packages.map((p) => p.project_id).filter((x): x is string => Boolean(x)))];
    const [ordersRes, projectsRes, pagePriceCents] = await Promise.all([
      orderIds.length
        ? db().from("book_orders").select("id, project_title").in("id", orderIds)
        : Promise.resolve({ data: [] as Array<{ id: string; project_title: string | null }> }),
      projectIds.length
        ? db().from("library_projects").select("id, name").in("id", projectIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
      sheetPriceCents(),
    ]);
    const orderTitle = new Map(((ordersRes.data ?? []) as Array<{ id: string; project_title: string | null }>).map((o) => [o.id, o.project_title]));
    const projectName = new Map(((projectsRes.data ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name]));
    const refundedBySessionEarly = (sessionId: string | null) =>
      sessionId ? refunds.filter((r) => r.stripe_checkout_session_id === sessionId && r.status !== "failed").reduce((t, r) => t + r.amount_cents, 0) : 0;
    const packageInfo = (p: (typeof packages)[number]): PackageInfo => {
      const price = p.package_price_cents ?? 0;
      const cancelable = p.status === "active" && !p.refunded_at && !p.book_order_id;
      const made = Math.max(0, (p.pages_used ?? 0) - (p.pages_brought_in ?? 0));
      return {
        id: p.id,
        status: p.status,
        paidWith: p.paid_with === "card" ? "card" : "credit",
        cancelable,
        refundQuoteCents: cancelable
          ? Math.max(0, price - Math.min(price, made * pagePriceCents) - (p.paid_with === "card" ? refundedBySessionEarly(p.stripe_session_id) : 0))
          : null,
      };
    };

    // What has gone back to each card charge already (pending counts: it's on its way).
    const refundedBySession = new Map<string, number>();
    for (const r of refunds) {
      if (r.status === "failed") continue;
      refundedBySession.set(r.stripe_checkout_session_id, (refundedBySession.get(r.stripe_checkout_session_id) ?? 0) + r.amount_cents);
    }
    const refundById = new Map(refunds.map((r) => [r.id, r]));

    // A top-up's ledger row is written in the same transaction as its session row, same timestamp.
    const sessionForTopUp = new Map<string, SessionRow>();
    const unmatched = [...sessions];
    for (const l of ledger) {
      if (l.reason !== "stripe_purchase") continue;
      const t = Date.parse(l.created_at);
      let best = -1;
      let bestGap = Infinity;
      unmatched.forEach((s, i) => {
        if (s.amount_cents !== l.delta) return;
        const gap = Math.abs(Date.parse(s.credited_at) - t);
        if (gap < bestGap) {
          best = i;
          bestGap = gap;
        }
      });
      if (best >= 0 && bestGap < 60_000) {
        sessionForTopUp.set(l.id, unmatched[best]);
        unmatched.splice(best, 1);
      }
    }

    const entries: PaymentEntry[] = [];
    const usageByDay = new Map<string, { at: string; cents: number; counts: Map<string, number>; balanceAfter: number }>();

    for (const l of ledger) {
      if (USAGE_REASONS.has(l.reason)) {
        const day = l.created_at.slice(0, 10);
        const cur = usageByDay.get(day) ?? { at: l.created_at, cents: 0, counts: new Map(), balanceAfter: l.balance_after };
        cur.cents += l.delta;
        cur.counts.set(l.reason, (cur.counts.get(l.reason) ?? 0) + 1);
        usageByDay.set(day, cur);
        continue;
      }

      let kind: PaymentKind;
      let channel: "wallet" | "card" = "wallet";
      let label: string;
      let note = l.note?.trim() || null;
      let amountCents = l.delta;
      let card: CardChargeInfo | undefined;
      let refundStatus: PaymentEntry["refundStatus"];
      let refundError: string | null | undefined;
      let pkg: PackageInfo | undefined;

      if (l.reason === "stripe_purchase") {
        kind = "topup";
        channel = "card";
        label = "Wallet top-up by card";
        if (note === "Stripe wallet top-up") note = null;
        // The customer paid by card: from their side it's money out, and the wallet went up.
        amountCents = -l.delta;
        const s = sessionForTopUp.get(l.id);
        if (s) {
          const refunded = refundedBySession.get(s.stripe_checkout_session_id) ?? 0;
          card = {
            sessionId: s.stripe_checkout_session_id,
            source: "wallet_topup",
            chargedCents: s.amount_cents,
            refundedCents: refunded,
            refundableCents: Math.max(0, Math.min(s.amount_cents - refunded, balanceCents)),
          };
        }
      } else if (l.reason === "card_refund") {
        kind = "card_refund";
        channel = "card";
        label = "Refunded to card from the wallet";
        amountCents = -l.delta;
        const r = l.reference_id ? refundById.get(l.reference_id) : undefined;
        refundStatus = r?.status;
        refundError = r?.error ?? null;
        if (note === "Refunded to your card") note = null;
      } else if (l.reason === "card_refund_reversal") {
        kind = "adjustment";
        label = "Card refund didn't go through, credit put back";
        note = null;
      } else if (GRANT_REASONS.has(l.reason)) {
        kind = l.delta >= 0 ? "grant" : "adjustment";
        label =
          l.reason === "welcome_credit"
            ? "Sign-up gift"
            : l.reason === "referral_credit"
              ? "Share with a friend credit"
              : l.delta >= 0
                ? "Credit added by admin"
                : "Credit removed by admin";
      } else if (PURCHASE_REASONS.has(l.reason)) {
        kind = "purchase";
        if (l.reason === "book_package") {
          const p = l.reference_id ? packageById.get(l.reference_id) : undefined;
          label = p ? packageLabel(p) : "Book package";
          if (p) pkg = packageInfo(p);
          const album = p?.project_id ? projectName.get(p.project_id) : null;
          note = album ? `Album “${album}”` : null;
        } else {
          const title = l.reference_id ? orderTitle.get(l.reference_id) : null;
          label = l.reason === "digital_book_payment" ? "Print-at-home book" : "Printed book order";
          note = title ? `“${title}”` : note;
        }
      } else if (REFUND_REASONS.has(l.reason)) {
        kind = "refund";
        if (l.reason === "book_package_refund") {
          const p = l.reference_id ? packageById.get(l.reference_id) : undefined;
          label = p?.paid_with === "card" ? "Card book package canceled, refunded to wallet" : "Book package canceled";
          if (note === "Book package canceled") note = null;
        } else if (l.reason === "order_refund") {
          const title = l.reference_id ? orderTitle.get(l.reference_id) : null;
          label = "Order canceled, refunded to wallet";
          note = title ? `“${title}”` : note;
        } else {
          label = "Refund to wallet";
        }
      } else {
        kind = l.delta >= 0 ? "grant" : "adjustment";
        label = l.reason.replace(/_/g, " ");
      }

      entries.push({
        // A card refund is addressed by its refund id, whichever kind of charge it came from.
        id: l.reason === "card_refund" && l.reference_id ? `refund:${l.reference_id}` : `ledger:${l.id}`,
        at: l.created_at,
        channel,
        kind,
        label,
        note,
        amountCents,
        walletDeltaCents: l.delta,
        walletBalanceAfterCents: l.balance_after,
        card,
        package: pkg,
        refundStatus,
        refundError,
        receiptable: kind === "topup" || kind === "purchase" || kind === "refund" || kind === "card_refund",
      });
    }

    for (const [day, u] of usageByDay) {
      const parts = [...u.counts.entries()].map(([reason, n]) => {
        const [one, many] = USAGE_NOUN[reason] ?? [reason, reason];
        return `${n} ${n === 1 ? one : many}`;
      });
      entries.push({
        id: `usage:${day}`,
        at: u.at,
        channel: "wallet",
        kind: "usage",
        label: parts.join(", "),
        note: null,
        amountCents: u.cents,
        walletDeltaCents: u.cents,
        walletBalanceAfterCents: u.balanceAfter,
        receiptable: false,
      });
    }

    for (const p of cardPackages) {
      const sessionId = p.stripe_session_id as string;
      const charged = p.package_price_cents ?? 0;
      const refunded = refundedBySession.get(sessionId) ?? 0;
      const album = p.project_id ? projectName.get(p.project_id) : null;
      entries.push({
        id: `card:${sessionId}`,
        at: p.created_at,
        channel: "card",
        kind: "card_purchase",
        label: packageLabel(p),
        note: [album ? `Album “${album}”` : null, p.status === "void" ? "Package canceled" : null].filter(Boolean).join(" · ") || null,
        amountCents: -charged,
        walletDeltaCents: null,
        walletBalanceAfterCents: null,
        card: {
          sessionId,
          source: "book_package",
          chargedCents: charged,
          refundedCents: refunded,
          refundableCents: Math.max(0, charged - refunded),
        },
        package: packageInfo(p),
        receiptable: true,
      });
    }

    // Package refunds to a card have no ledger row (top-up refunds do, above).
    for (const r of refunds) {
      if (r.kind !== "book_package") continue;
      const p = r.purchase_code_id ? packageById.get(r.purchase_code_id) : undefined;
      entries.push({
        id: `refund:${r.id}`,
        at: r.created_at,
        channel: "card",
        kind: "card_refund",
        label: r.cancels_package ? "Book package canceled, refunded to card" : "Partial refund to card",
        note: [p ? packageLabel(p) : null, r.note].filter(Boolean).join(" · ") || null,
        amountCents: r.amount_cents,
        walletDeltaCents: null,
        walletBalanceAfterCents: null,
        refundStatus: r.status,
        refundError: r.error,
        receiptable: r.status === "succeeded",
      });
    }

    entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    const cardChargedCents =
      sessions.reduce((t, s) => t + s.amount_cents, 0) + cardPackages.reduce((t, p) => t + (p.package_price_cents ?? 0), 0);
    const succeeded = refunds.filter((r) => r.status === "succeeded");
    const cardRefundedCents = succeeded.reduce((t, r) => t + r.amount_cents, 0);
    const packageCardRefunds = succeeded.filter((r) => r.kind === "book_package").reduce((t, r) => t + r.amount_cents, 0);
    const walletSpent = -ledger.filter((l) => !FUNDING_REASONS.has(l.reason)).reduce((t, l) => t + l.delta, 0);
    const grantedCents = ledger.filter((l) => GRANT_REASONS.has(l.reason)).reduce((t, l) => t + l.delta, 0);

    return {
      data: {
        balanceCents,
        totals: {
          cardChargedCents,
          cardRefundedCents,
          cardNetCents: cardChargedCents - cardRefundedCents,
          spentCents: walletSpent + cardPackages.reduce((t, p) => t + (p.package_price_cents ?? 0), 0) - packageCardRefunds,
          grantedCents,
        },
        entries,
      },
      error: null,
    };
  } catch (e) {
    log("error", "User payments failed", { userId, error: String(e) });
    return { data: null, error: { message: e instanceof Error ? e.message : "Couldn't load payments" } };
  }
}

/** Per account totals for the customers list. Null when migration 0050 isn't applied yet. */
export async function loadUserMoneyTotals(): Promise<Map<string, { spentCents: number; cardNetCents: number }> | null> {
  const { data, error } = await db().rpc("admin_user_money");
  if (error) {
    log("warn", "customer money totals unavailable", { error: error.message });
    return null;
  }
  const map = new Map<string, { spentCents: number; cardNetCents: number }>();
  for (const r of (data ?? []) as Array<{ user_id: string; spent_cents: number | string; card_charged_cents: number | string; card_refunded_cents: number | string }>) {
    map.set(r.user_id, {
      spentCents: Number(r.spent_cents),
      cardNetCents: Number(r.card_charged_cents) - Number(r.card_refunded_cents),
    });
  }
  return map;
}

/** The entry as the server sees it, so receipts never trust amounts sent by the browser. */
export async function findUserPayment(userId: string, entryId: string): Promise<ApiResult<PaymentEntry>> {
  const all = await listUserPayments(userId);
  if (all.error) return all;
  const entry = all.data.entries.find((e) => e.id === entryId);
  if (!entry) return { data: null, error: { message: "Payment not found", code: "NOT_FOUND" } };
  return { data: entry, error: null };
}

// --- Card details and refunds -------------------------------------------------------------------

async function sessionBelongsToUser(userId: string, sessionId: string): Promise<boolean> {
  const [s, p] = await Promise.all([
    db().from("credit_stripe_sessions").select("user_id").eq("stripe_checkout_session_id", sessionId).maybeSingle(),
    db().from("purchase_codes").select("redeemed_by, created_by").eq("stripe_session_id", sessionId).maybeSingle(),
  ]);
  const sRow = s.data as { user_id: string } | null;
  const pRow = p.data as { redeemed_by: string | null; created_by: string | null } | null;
  return sRow?.user_id === userId || pRow?.redeemed_by === userId || pRow?.created_by === userId;
}

async function retrievePaymentIntent(sessionId: string): Promise<{ session: Stripe.Checkout.Session; intent: Stripe.PaymentIntent | null }> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent.latest_charge.refunds"],
  });
  const intent = session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
  return { session, intent };
}

export async function getCardChargeDetails(userId: string, sessionId: string): Promise<ApiResult<CardChargeDetails>> {
  if (!(await sessionBelongsToUser(userId, sessionId))) {
    return { data: null, error: { message: "Card payment not found", code: "NOT_FOUND" } };
  }
  if (!stripeConfigured()) return { data: null, error: { message: "Stripe isn't configured here" } };
  try {
    const { session, intent } = await retrievePaymentIntent(sessionId);
    const charge = intent?.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    const card = charge?.payment_method_details?.card ?? null;
    return {
      data: {
        paymentIntentId: intent?.id ?? null,
        brand: card?.brand ?? null,
        last4: card?.last4 ?? null,
        stripeReceiptUrl: charge?.receipt_url ?? null,
        stripeRefundedCents: charge?.amount_refunded ?? 0,
        dashboardUrl: intent ? `https://dashboard.stripe.com/${session.livemode ? "" : "test/"}payments/${intent.id}` : null,
        livemode: session.livemode,
      },
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log("warn", "Card details lookup failed", { userId, sessionId, error: message });
    return {
      data: null,
      error: {
        message: /No such checkout/i.test(message)
          ? "Stripe doesn't know this payment with the keys this server uses (test vs live)."
          : "Couldn't reach Stripe for this payment.",
      },
    };
  }
}

const REFUND_ERRORS: Record<string, string> = {
  "amount exceeds refundable": "That's more than is left to refund on this payment.",
  "insufficient credits": "The wallet doesn't hold that much any more. A top-up can only be refunded from unspent balance.",
  "package not active": "This package was already canceled.",
  "book already ordered": "A book was already ordered with this package, so it can't be canceled. Refund part of it instead.",
  "card payment not found": "Card payment not found.",
  "already refunded": "This package was already canceled and refunded.",
};

/**
 * Send card money back. The database holds the amount (and takes it out of the wallet for a
 * top-up) before Stripe is asked, so the wallet can't be spent meanwhile and nothing is refunded
 * twice; if Stripe says no, the hold is released and the wallet is put back.
 */
export async function refundCardPayment(
  userId: string,
  adminId: string,
  input: CardRefundRequest,
): Promise<ApiResult<CardRefundResult & { kind: "wallet_topup" | "book_package"; chargedCents: number }>> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { data: null, error: { message: "Enter an amount to refund" } };
  }
  if (!(await sessionBelongsToUser(userId, input.sessionId))) {
    return { data: null, error: { message: "Card payment not found", code: "NOT_FOUND" } };
  }
  if (!stripeConfigured()) return { data: null, error: { message: "Stripe isn't configured here" } };

  const begin = await db().rpc("admin_begin_card_refund", {
    p_session_id: input.sessionId,
    p_amount_cents: input.amountCents,
    p_cancel_package: input.cancelPackage === true,
    p_created_by: adminId,
    p_note: input.note?.trim() || null,
  });
  if (begin.error) {
    const known = Object.keys(REFUND_ERRORS).find((k) => begin.error!.message.includes(k));
    if (!known) log("error", "Card refund begin failed", { userId, sessionId: input.sessionId, error: begin.error.message });
    return { data: null, error: { message: known ? REFUND_ERRORS[known] : begin.error.message } };
  }
  const held = begin.data as {
    refundId: string;
    kind: "wallet_topup" | "book_package";
    chargedCents: number;
    creditsBalanceCents: number | null;
  };

  let stripeRefund: Stripe.Refund;
  try {
    const { intent } = await retrievePaymentIntent(input.sessionId);
    if (!intent) throw new Error("This checkout has no payment to refund");
    stripeRefund = await getStripe().refunds.create(
      {
        payment_intent: intent.id,
        amount: input.amountCents,
        reason: "requested_by_customer",
        metadata: { refundId: held.refundId, userId, adminId, kind: held.kind },
      },
      { idempotencyKey: `card_refund_${held.refundId}` },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log("error", "Stripe refund failed", { userId, sessionId: input.sessionId, refundId: held.refundId, error: message });
    const failed = await db().rpc("admin_fail_card_refund", { p_refund_id: held.refundId, p_error: message });
    if (failed.error) {
      log("error", "Card refund release failed", { refundId: held.refundId, error: failed.error.message });
    }
    return { data: null, error: { message: `Stripe didn't refund it: ${message}` } };
  }

  if (stripeRefund.status === "failed" || stripeRefund.status === "canceled") {
    await db().rpc("admin_fail_card_refund", { p_refund_id: held.refundId, p_error: `Stripe refund ${stripeRefund.status}` });
    return { data: null, error: { message: `Stripe marked the refund ${stripeRefund.status}.` } };
  }

  const finish = await db().rpc("admin_finish_card_refund", {
    p_refund_id: held.refundId,
    p_stripe_refund_id: stripeRefund.id,
  });
  if (finish.error) {
    // Stripe has refunded; the row stays pending (still counted as refunded) for someone to look at.
    log("error", "Card refund finish failed after Stripe refunded", {
      refundId: held.refundId,
      stripeRefundId: stripeRefund.id,
      error: finish.error.message,
    });
  }
  log("info", "Card refund issued", {
    adminId,
    userId,
    refundId: held.refundId,
    stripeRefundId: stripeRefund.id,
    amountCents: input.amountCents,
    kind: held.kind,
  });

  return {
    data: {
      refundId: held.refundId,
      status: finish.error ? "pending" : "succeeded",
      amountCents: input.amountCents,
      creditsBalanceCents: held.creditsBalanceCents ?? null,
      kind: held.kind,
      chargedCents: held.chargedCents,
    },
    error: null,
  };
}

// --- Receipts and package cancel -----------------------------------------------------------------

/** The card charge a line belongs to, for the card brand and last four on its receipt. */
async function cardForReceipt(userId: string, entry: PaymentEntry): Promise<{ brand: string | null; last4: string | null } | null> {
  let sessionId = entry.card?.sessionId ?? null;
  if (!sessionId && entry.id.startsWith("refund:")) {
    const { data } = await db().from("card_refunds").select("stripe_checkout_session_id").eq("id", entry.id.slice(7)).maybeSingle();
    sessionId = (data as { stripe_checkout_session_id: string } | null)?.stripe_checkout_session_id ?? null;
  }
  if (!sessionId || !stripeConfigured()) return null;
  const details = await getCardChargeDetails(userId, sessionId);
  return details.data ? { brand: details.data.brand, last4: details.data.last4 } : null;
}

export async function sendPaymentReceipt(input: {
  userId: string;
  entryId: string;
  adminId: string;
  message?: string;
  accountUrl: string;
}): Promise<ApiResult<{ emailSent: boolean; to: string }>> {
  const found = await findUserPayment(input.userId, input.entryId);
  if (found.error) return found;
  if (!found.data.receiptable) return { data: null, error: { message: "This line doesn't get a receipt" } };

  const [{ data: authUser }, { data: profile }] = await Promise.all([
    getSupabaseAuthAdmin().auth.admin.getUserById(input.userId),
    db().from("profiles").select("display_name").eq("id", input.userId).maybeSingle(),
  ]);
  const to = authUser.user?.email;
  if (!to) return { data: null, error: { message: "This account has no email address" } };

  const card = await cardForReceipt(input.userId, found.data).catch(() => null);
  const emailSent = await sendEmail(
    paymentReceiptEmail({
      to,
      customerName: (profile as { display_name: string | null } | null)?.display_name ?? null,
      entry: found.data,
      card,
      message: input.message,
      accountUrl: input.accountUrl,
    }),
  );
  log("info", "Payment receipt sent", { adminId: input.adminId, userId: input.userId, entryId: input.entryId, emailSent });
  return { data: { emailSent, to }, error: null };
}

/**
 * Cancel a book package on the customer's behalf with their own rule: unused value back to the
 * wallet. A card package that already had money sent back to the card must be finished with a card
 * refund instead, or the same money would be returned twice.
 */
export async function cancelPackageToWallet(
  userId: string,
  packageId: string,
  adminId: string,
): Promise<ApiResult<{ refundCents: number; creditsBalanceCents: number }>> {
  const { data: code, error } = await db()
    .from("purchase_codes")
    .select("id, project_id, redeemed_by, paid_with, stripe_session_id, source")
    .eq("id", packageId)
    .maybeSingle();
  const row = code as {
    id: string;
    project_id: string | null;
    redeemed_by: string | null;
    paid_with: string | null;
    stripe_session_id: string | null;
    source: string;
  } | null;
  if (error || !row || row.source !== "package" || row.redeemed_by !== userId || !row.project_id) {
    return { data: null, error: { message: "Package not found", code: "NOT_FOUND" } };
  }
  if (row.paid_with === "card" && row.stripe_session_id) {
    const { data: prior } = await db()
      .from("card_refunds")
      .select("id")
      .eq("stripe_checkout_session_id", row.stripe_session_id)
      .neq("status", "failed")
      .limit(1);
    if (prior && prior.length > 0) {
      return { data: null, error: { message: "Part of this package was already refunded to the card. Cancel it with a card refund instead." } };
    }
  }
  const { data, error: rpcError } = await db().rpc("cancel_book_package", { p_user_id: userId, p_project_id: row.project_id });
  if (rpcError) {
    const known = ["book already ordered", "already refunded", "package not active"].find((k) => rpcError.message.includes(k));
    return {
      data: null,
      error: { message: known ? REFUND_ERRORS[known] ?? "This package can't be canceled." : rpcError.message },
    };
  }
  const r = (data ?? {}) as { refundCents?: number; creditsBalanceCents?: number };
  log("info", "Admin canceled book package to wallet", { adminId, userId, packageId, refundCents: r.refundCents });
  return { data: { refundCents: Number(r.refundCents) || 0, creditsBalanceCents: Number(r.creditsBalanceCents) || 0 }, error: null };
}
