"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, CreditCard, ExternalLink, Loader2, Mail, RotateCcw, Wallet, XCircle } from "lucide-react";
import type { AdminUser } from "@/lib/api/types";
import type { CardChargeDetails, PaymentEntry, UserPayments } from "@/lib/payments/types";
import { parseDollarsToCents } from "@/lib/credits/money";
import * as api from "@/lib/api/client";
import { useAuth } from "@/context/AuthContext";
import { fullDateTime, money, shortDate, signedMoney } from "@/components/v2/admin/format";
import { Callout, MoneyInput, SegmentedControl, StatusPill } from "@/components/v2/admin/ui";
import { useActions } from "@/components/v2/admin/customers/shared";
import { cn } from "@/lib/cn";

const QUICK = [
  { label: "+$5", cents: 500 },
  { label: "+$10", cents: 1000 },
  { label: "+$25", cents: 2500 },
];

type Filter = "all" | "card" | "wallet";

/**
 * Everything this customer has paid or been given, card and wallet in one list. Card lines can be
 * refunded to the card; packages can be canceled to the wallet; any payment can be emailed as a
 * receipt. Granting wallet credit sits on top.
 */
export function CustomerPaymentsTab({ user, onBalance }: { user: AdminUser; onBalance: (cents: number) => void }) {
  const { user: me } = useAuth();
  const canGrant = me?.permissions.includes("usermanage:adjustcredits") ?? false;
  const canRefund = me?.permissions.includes("usermanage:refundpayments") ?? false;
  const [payments, setPayments] = useState<UserPayments | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api.adminUserPayments(user.id);
    if (api.isError(r)) {
      setLoadError(r.error.message);
      return;
    }
    setLoadError(null);
    setPayments(r.data);
    onBalance(r.data.balanceCents);
    // onBalance changes identity on every drawer render; the user id is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    let alive = true;
    void api.adminUserPayments(user.id).then((r) => {
      if (!alive) return;
      if (api.isError(r)) setLoadError(r.error.message);
      else setPayments(r.data);
    });
    return () => {
      alive = false;
    };
  }, [user.id]);

  const visible = useMemo(
    () => (payments?.entries ?? []).filter((e) => filter === "all" || e.channel === filter || (filter === "wallet" && e.walletDeltaCents != null)),
    [payments, filter],
  );
  const totals = payments?.totals;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Wallet balance" value={money(payments?.balanceCents ?? user.creditsBalanceCents)} note="Unspent credit" />
        <Stat
          label="Paid by card"
          value={totals ? money(totals.cardNetCents) : "—"}
          note={totals && totals.cardRefundedCents > 0 ? `${money(totals.cardChargedCents)} charged, ${money(totals.cardRefundedCents)} refunded` : "Top-ups and card purchases"}
        />
        <Stat label="Spent" value={totals ? money(totals.spentCents) : "—"} note="Books, packages, pages, less refunds" />
        <Stat label="Free credit given" value={totals ? money(totals.grantedCents) : "—"} note="Gifts, friend credit, admin" />
      </div>

      {canGrant ? <GrantForm user={user} onDone={reload} /> : null}

      <section aria-labelledby="payments-list" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="payments-list" className="text-sm font-semibold text-v2-ink">
            Payments and wallet history
          </h3>
          <SegmentedControl
            ariaLabel="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All" },
              { id: "card", label: "Card" },
              { id: "wallet", label: "Wallet" },
            ]}
          />
        </div>
        {loadError ? (
          <p className="text-sm text-red-700" role="alert">
            Couldn&apos;t load payments: {loadError}
          </p>
        ) : payments == null ? (
          <p className="flex items-center gap-2 text-sm text-v2-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-v2-muted">{filter === "all" ? "No payments or wallet changes yet." : `No ${filter} payments.`}</p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
            {visible.map((entry) => (
              <PaymentRow
                key={entry.id}
                entry={entry}
                user={user}
                open={openId === entry.id}
                onToggle={() => setOpenId((cur) => (cur === entry.id ? null : entry.id))}
                canRefund={canRefund}
                canCancel={canGrant}
                onChanged={reload}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-xs text-v2-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-v2-ink">{value}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-v2-muted">{note}</p>
    </div>
  );
}

// --- Tags ---------------------------------------------------------------------------------------

function ChannelTag({ entry }: { entry: PaymentEntry }) {
  if (entry.kind === "topup") {
    return (
      <StatusPill tone="info" icon={CreditCard}>
        Card → wallet
      </StatusPill>
    );
  }
  if (entry.kind === "card_refund") {
    return (
      <StatusPill tone="warn" icon={RotateCcw}>
        Card refund
      </StatusPill>
    );
  }
  if (entry.channel === "card") {
    return (
      <StatusPill tone="info" icon={CreditCard}>
        Card
      </StatusPill>
    );
  }
  return (
    <StatusPill tone={entry.kind === "grant" ? "good" : "neutral"} icon={Wallet}>
      {entry.kind === "grant" ? "Wallet credit" : "Wallet"}
    </StatusPill>
  );
}

function RefundStatus({ entry }: { entry: PaymentEntry }) {
  if (!entry.refundStatus || entry.refundStatus === "succeeded") return null;
  return entry.refundStatus === "pending" ? (
    <StatusPill tone="warn">Processing</StatusPill>
  ) : (
    <StatusPill tone="bad">Failed</StatusPill>
  );
}

// --- A row --------------------------------------------------------------------------------------

function hasActions(entry: PaymentEntry, canCancel: boolean): boolean {
  return Boolean(entry.receiptable || entry.card || (canCancel && entry.package?.cancelable) || entry.refundError);
}

function PaymentRow({
  entry,
  user,
  open,
  onToggle,
  canRefund,
  canCancel,
  onChanged,
}: {
  entry: PaymentEntry;
  user: AdminUser;
  open: boolean;
  onToggle: () => void;
  canRefund: boolean;
  canCancel: boolean;
  onChanged: () => Promise<void>;
}) {
  const expandable = hasActions(entry, canCancel);
  const amountTone = entry.amountCents >= 0 ? "text-emerald-700" : "text-v2-ink";
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <ChannelTag entry={entry} />
          <span className="font-semibold text-v2-ink">{entry.label}</span>
          <RefundStatus entry={entry} />
          {entry.package?.status === "void" && entry.kind !== "card_refund" ? <StatusPill tone="neutral">Canceled</StatusPill> : null}
          {entry.card && entry.card.refundedCents > 0 ? (
            <StatusPill tone="warn">
              {entry.card.refundedCents >= entry.card.chargedCents ? "Refunded" : `${money(entry.card.refundedCents)} refunded`}
            </StatusPill>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-v2-muted">
          <time dateTime={entry.at} title={fullDateTime(entry.at)}>
            {shortDate(entry.at)}
          </time>
          {entry.note ? ` · ${entry.note}` : null}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={cn("block font-semibold tabular-nums", amountTone)}>{signedMoney(entry.amountCents)}</span>
        {entry.walletDeltaCents != null && entry.channel === "card" ? (
          <span className="block text-xs tabular-nums text-v2-muted">wallet {signedMoney(entry.walletDeltaCents)}</span>
        ) : null}
        {entry.walletBalanceAfterCents != null ? (
          <span className="block text-xs tabular-nums text-v2-muted">bal. {money(entry.walletBalanceAfterCents)}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <li className={cn(open && "bg-v2-bg-subtle/60")}>
      {expandable ? (
        <button
          type="button"
          className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-v2-bg-subtle"
          aria-expanded={open}
          onClick={onToggle}
        >
          {body}
          <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-v2-muted transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      ) : (
        <div className="flex items-start gap-3 px-3 py-2.5 text-sm">
          {body}
          <span className="w-4 shrink-0" aria-hidden />
        </div>
      )}
      {open ? <PaymentActions entry={entry} user={user} canRefund={canRefund} canCancel={canCancel} onChanged={onChanged} /> : null}
    </li>
  );
}

// --- Actions for an opened row ------------------------------------------------------------------

function PaymentActions({
  entry,
  user,
  canRefund,
  canCancel,
  onChanged,
}: {
  entry: PaymentEntry;
  user: AdminUser;
  canRefund: boolean;
  canCancel: boolean;
  onChanged: () => Promise<void>;
}) {
  const [details, setDetails] = useState<CardChargeDetails | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const sessionId = entry.card?.sessionId ?? null;

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    void api.adminCardChargeDetails(user.id, sessionId).then((r) => {
      if (!alive) return;
      if (api.isError(r)) setDetailsError(r.error.message);
      else setDetails(r.data);
    });
    return () => {
      alive = false;
    };
  }, [user.id, sessionId]);

  const stripeOutside =
    details && entry.card && details.stripeRefundedCents > entry.card.refundedCents
      ? details.stripeRefundedCents - entry.card.refundedCents
      : 0;

  return (
    <div className="space-y-4 border-t border-gray-100 px-3 pb-4 pt-3">
      {entry.refundError ? (
        <Callout tone="critical" title="Stripe didn't complete this refund">
          {entry.refundError}
        </Callout>
      ) : null}

      {sessionId ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-v2-muted">
          {details ? (
            <>
              <span>
                {details.brand ? `${details.brand.charAt(0).toUpperCase()}${details.brand.slice(1)}` : "Card"}
                {details.last4 ? ` •••• ${details.last4}` : ""}
                {details.livemode ? "" : " (test mode)"}
              </span>
              {details.dashboardUrl ? (
                <a className="inline-flex items-center gap-1 font-semibold text-v2-primary hover:underline" href={details.dashboardUrl} target="_blank" rel="noreferrer">
                  Open in Stripe <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
              {details.stripeReceiptUrl ? (
                <a className="inline-flex items-center gap-1 font-semibold text-v2-primary hover:underline" href={details.stripeReceiptUrl} target="_blank" rel="noreferrer">
                  Stripe receipt <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </>
          ) : detailsError ? (
            <span className="text-amber-800">{detailsError}</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Checking Stripe…
            </span>
          )}
          <span className="font-mono text-[11px]" title="Stripe checkout session">
            {sessionId}
          </span>
        </div>
      ) : null}

      {stripeOutside > 0 ? (
        <Callout tone="warning" title={`Stripe shows ${money(stripeOutside)} more refunded than recorded here`}>
          Someone refunded this in the Stripe dashboard. The wallet and package weren&apos;t changed by that refund.
        </Callout>
      ) : null}

      {canRefund && entry.card && entry.card.refundableCents > 0 ? (
        <RefundForm entry={entry} user={user} cardLabel={details?.last4 ? `card •••• ${details.last4}` : "their card"} onChanged={onChanged} />
      ) : entry.card && entry.card.source === "wallet_topup" && entry.card.refundedCents < entry.card.chargedCents && canRefund ? (
        <p className="text-xs text-v2-muted">
          Nothing left to refund: this credit has been spent. Only unspent wallet balance can go back to the card.
        </p>
      ) : null}

      {canCancel && entry.package?.cancelable ? <CancelToWallet entry={entry} user={user} onChanged={onChanged} /> : null}

      {entry.receiptable ? <ReceiptForm entry={entry} user={user} /> : null}
    </div>
  );
}

function RefundForm({
  entry,
  user,
  cardLabel,
  onChanged,
}: {
  entry: PaymentEntry;
  user: AdminUser;
  cardLabel: string;
  onChanged: () => Promise<void>;
}) {
  const card = entry.card!;
  const isPackage = card.source === "book_package";
  const canCancelPackage = isPackage && entry.package?.cancelable === true;
  const [mode, setMode] = useState<"cancel" | "partial">(canCancelPackage ? "cancel" : "partial");
  const defaultCents =
    isPackage && mode === "cancel" ? (entry.package?.refundQuoteCents ?? card.refundableCents) : card.refundableCents;
  const [amount, setAmount] = useState((defaultCents / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { busy, errors, run } = useActions();
  const cents = parseDollarsToCents(amount.trim());
  const invalid = cents == null || cents <= 0 || cents > card.refundableCents;

  function pickMode(next: "cancel" | "partial") {
    setMode(next);
    const c = next === "cancel" ? (entry.package?.refundQuoteCents ?? card.refundableCents) : card.refundableCents;
    setAmount((c / 100).toFixed(2));
    setConfirming(false);
  }

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-3" aria-label="Refund to card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-v2-ink">Refund to {cardLabel}</p>
        <p className="text-xs text-v2-muted">Up to {money(card.refundableCents)}</p>
      </div>
      {card.source === "wallet_topup" ? (
        <p className="text-xs text-v2-muted">The same amount comes out of their wallet, so only unspent credit can be refunded.</p>
      ) : null}
      {isPackage ? (
        <SegmentedControl
          ariaLabel="Refund type"
          value={mode}
          onChange={pickMode}
          options={[
            ...(canCancelPackage ? [{ id: "cancel" as const, label: "Cancel package and refund" }] : []),
            { id: "partial", label: "Partial refund, keep package" },
          ]}
        />
      ) : null}
      {isPackage && mode === "cancel" && entry.package?.refundQuoteCents != null ? (
        <p className="text-xs text-v2-muted">
          Unused value under the customer&apos;s own cancel rule is {money(entry.package.refundQuoteCents)} (price less pages made). The package
          stops working once refunded.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <label className="v2-label" htmlFor={`refund-amount-${entry.id}`}>
            Amount
          </label>
          <MoneyInput id={`refund-amount-${entry.id}`} value={amount} onChange={(v) => (setAmount(v), setConfirming(false))} invalid={!!amount && invalid} />
        </div>
        <div>
          <label className="v2-label" htmlFor={`refund-note-${entry.id}`}>
            Reason (shown on their receipt)
          </label>
          <input
            id={`refund-note-${entry.id}`}
            type="text"
            className="v2-input"
            maxLength={500}
            placeholder="e.g. Book arrived damaged"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-v2-ink">
        <input type="checkbox" className="h-4 w-4 accent-v2-primary" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Email them a refund receipt
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p role="status" className={cn("mr-auto text-xs font-semibold", done ? "text-v2-success-text" : "text-red-700")}>
          {done ?? errors.refund ?? ""}
        </p>
        {confirming ? (
          <>
            <button type="button" className="v2-btn-sm" onClick={() => setConfirming(false)} disabled={busy === "refund"}>
              Back
            </button>
            <button
              type="button"
              className="v2-btn-sm v2-btn-sm-danger"
              disabled={busy === "refund" || invalid}
              onClick={() =>
                void run("refund", async () => {
                  setDone(null);
                  const r = await api.adminRefundCardPayment(user.id, {
                    sessionId: card.sessionId,
                    amountCents: cents!,
                    cancelPackage: isPackage && mode === "cancel",
                    note: note.trim() || undefined,
                    notifyUser: notify,
                  });
                  if (api.isError(r)) return { ok: false, message: r.error.message };
                  setConfirming(false);
                  setDone(
                    `${money(r.data.amountCents)} refunded${r.data.status === "pending" ? " (still recording, check again shortly)" : ""}${
                      notify ? (r.data.emailSent ? ", receipt sent" : ", but the receipt email failed") : ""
                    }`,
                  );
                  await onChanged();
                  return { ok: true };
                })
              }
            >
              {busy === "refund" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />}
              Yes, refund {cents ? money(cents) : ""} now
            </button>
          </>
        ) : (
          <button type="button" className="v2-btn-sm v2-btn-sm-danger" disabled={invalid} onClick={() => setConfirming(true)}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Refund {cents && !invalid ? money(cents) : ""}
          </button>
        )}
      </div>
      {confirming ? (
        <p className="text-xs text-red-800">
          This sends {cents ? money(cents) : "the money"} back to {cardLabel} through Stripe and can&apos;t be undone
          {card.source === "wallet_topup" ? `. Their wallet goes down by the same amount.` : isPackage && mode === "cancel" ? ". The package is canceled." : "."}
        </p>
      ) : null}
    </section>
  );
}

function CancelToWallet({ entry, user, onChanged }: { entry: PaymentEntry; user: AdminUser; onChanged: () => Promise<void> }) {
  const pkg = entry.package!;
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { busy, errors, run } = useActions();
  const quote = pkg.refundQuoteCents ?? 0;
  return (
    <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3" aria-label="Cancel package to wallet">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-v2-ink">Cancel package, credit the wallet</p>
        <p className="text-xs text-v2-muted">
          Returns {money(quote)} to their wallet (price less pages made), the same as if they canceled it themselves. The album stays.
        </p>
        <p role="status" className={cn("text-xs font-semibold", done ? "text-v2-success-text" : "text-red-700")}>
          {done ?? errors.cancel ?? ""}
        </p>
      </div>
      {confirming ? (
        <span className="flex gap-2">
          <button type="button" className="v2-btn-sm" onClick={() => setConfirming(false)} disabled={busy === "cancel"}>
            Back
          </button>
          <button
            type="button"
            className="v2-btn-sm v2-btn-sm-danger"
            disabled={busy === "cancel"}
            onClick={() =>
              void run("cancel", async () => {
                const r = await api.adminCancelPackageToWallet(user.id, pkg.id);
                if (api.isError(r)) return { ok: false, message: r.error.message };
                setConfirming(false);
                setDone(`${money(r.data.refundCents)} returned to the wallet`);
                await onChanged();
                return { ok: true };
              })
            }
          >
            {busy === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
            Yes, cancel it
          </button>
        </span>
      ) : (
        <button type="button" className="v2-btn-sm" onClick={() => setConfirming(true)}>
          <XCircle className="h-3.5 w-3.5" aria-hidden />
          Cancel package
        </button>
      )}
    </section>
  );
}

function ReceiptForm({ entry, user }: { entry: PaymentEntry; user: AdminUser }) {
  const [message, setMessage] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { busy, errors, run } = useActions();
  return (
    <section className="space-y-2 rounded-lg border border-gray-200 bg-white p-3" aria-label="Email receipt">
      <p className="text-sm font-semibold text-v2-ink">Email a receipt</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`receipt-msg-${entry.id}`}>
          Optional note
        </label>
        <input
          id={`receipt-msg-${entry.id}`}
          type="text"
          className="v2-input flex-1"
          maxLength={500}
          placeholder="Optional note to include"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button
          type="button"
          className="v2-btn-sm v2-btn-sm-primary h-10 shrink-0"
          disabled={busy === "receipt"}
          onClick={() =>
            void run("receipt", async () => {
              setSentTo(null);
              const r = await api.adminSendPaymentReceipt(user.id, entry.id, message.trim() || undefined);
              if (api.isError(r)) return { ok: false, message: r.error.message };
              if (!r.data.emailSent) return { ok: false, message: "The email couldn't be sent. Try again." };
              setSentTo(r.data.to);
              return { ok: true };
            })
          }
        >
          {busy === "receipt" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
          Send to {user.email ?? "customer"}
        </button>
      </div>
      <p role="status" className={cn("text-xs font-semibold", sentTo ? "text-v2-success-text" : "text-red-700")}>
        {sentTo ? `Receipt sent to ${sentTo}` : (errors.receipt ?? "")}
      </p>
    </section>
  );
}

// --- Grant ----------------------------------------------------------------------------------------

/** Grant or remove wallet credit, optionally emailing the customer. */
function GrantForm({ user, onDone }: { user: AdminUser; onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState("10.00");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(false);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const { busy, flash, errors, run } = useActions();

  function apply(input: { deltaCents: number } | { amountDollars: string }, fallbackNote?: string) {
    const typedNote = note.trim();
    setEmailSent(null);
    return run("credits", async () => {
      const r = await api.adminAdjustUserCredits(user.id, {
        ...input,
        note: typedNote || fallbackNote,
        notifyUser: notify,
        emailNote: typedNote || undefined,
      });
      if (api.isError(r)) return { ok: false, message: r.error.message };
      setEmailSent(r.data.emailSent ?? null);
      await onDone();
      return { ok: true };
    });
  }

  const working = busy === "credits";

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 p-4" aria-labelledby="wallet-grant">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="wallet-grant" className="text-sm font-semibold text-v2-ink">
            Grant wallet credit
          </h3>
          <p className="text-xs text-v2-muted">Free credit, spent on pages and books before their card is charged.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick grants">
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              className="v2-btn-sm v2-btn-sm-primary"
              disabled={working}
              onClick={() => void apply({ deltaCents: q.cents }, `Granted ${q.label}`)}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = amount.trim();
          if (trimmed) void apply({ amountDollars: trimmed });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div>
            <label className="v2-label" htmlFor="wallet-amount">
              Amount (− removes)
            </label>
            <MoneyInput id="wallet-amount" value={amount} onChange={setAmount} />
          </div>
          <div>
            <label className="v2-label" htmlFor="wallet-note">
              Note shown in their history
            </label>
            <input
              id="wallet-note"
              type="text"
              className="v2-input"
              placeholder="e.g. Sorry about the late book"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-v2-ink" htmlFor="wallet-notify">
            <input
              id="wallet-notify"
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-v2-primary"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
            Email them about a grant
          </label>
          <span className="flex items-center gap-3">
            <span role="status" className={cn("text-xs font-semibold", emailSent ? "text-v2-success-text" : "text-red-700")}>
              {emailSent === null
                ? (errors.credits ?? "")
                : emailSent
                  ? `Email sent to ${user.email ?? "the customer"}`
                  : "Credit applied, but the email couldn't be sent"}
            </span>
            <button type="submit" className="v2-btn-primary h-9 py-0" disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {flash.credits === "ok" ? "Updated" : "Apply"}
            </button>
          </span>
        </div>
      </form>
    </section>
  );
}
