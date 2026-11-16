"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AdminUser } from "@/lib/api/types";
import type { CreditLedgerEntry } from "@/lib/credits/types";
import * as api from "@/lib/api/client";
import { fullDateTime, money, shortDate, signedMoney } from "@/components/v2/admin/format";
import { MoneyInput } from "@/components/v2/admin/ui";
import { useActions } from "@/components/v2/admin/customers/shared";
import { cn } from "@/lib/cn";

const QUICK = [
  { label: "+$5", cents: 500 },
  { label: "+$10", cents: 1000 },
  { label: "+$25", cents: 2500 },
];

/** Grant or remove wallet credit, optionally emailing the customer, and the wallet's history. */
export function CustomerWalletTab({ user, onBalance }: { user: AdminUser; onBalance: (cents: number) => void }) {
  const [amount, setAmount] = useState("10.00");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(false);
  /** Outcome of the email for the latest adjustment; null when none was requested. */
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerEntry[] | null>(null);
  const { busy, flash, errors, run } = useActions();

  useEffect(() => {
    let alive = true;
    void api.adminListUserCredits(user.id).then((r) => {
      if (alive) setLedger(api.isError(r) ? [] : r.data);
    });
    return () => {
      alive = false;
    };
  }, [user.id]);

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
      onBalance(r.data.creditsBalanceCents);
      setEmailSent(r.data.emailSent ?? null);
      const fresh = await api.adminListUserCredits(user.id);
      if (!api.isError(fresh)) setLedger(fresh.data);
      return { ok: true };
    });
  }

  const working = busy === "credits";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-gray-200 p-4">
        <div>
          <p className="text-sm text-v2-muted">Wallet balance</p>
          <p className="text-3xl font-semibold tabular-nums text-v2-ink">{money(user.creditsBalanceCents)}</p>
          <p className="mt-0.5 text-xs text-v2-muted">Spent on pages and books before their card is charged.</p>
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
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = amount.trim();
          if (trimmed) void apply({ amountDollars: trimmed });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <div>
            <label className="v2-label" htmlFor="wallet-amount">
              Amount (use − to remove)
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
        <label className="flex items-start gap-2.5 text-sm text-v2-ink" htmlFor="wallet-notify">
          <input
            id="wallet-notify"
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-v2-primary"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Email them about it</span>
            <span className="block text-xs text-v2-muted">
              Says how much was added and what credit is for, with your note. Sent for grants only, including the quick
              buttons above.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p role="status" className={cn("text-xs font-semibold", emailSent ? "text-v2-success-text" : "text-red-700")}>
            {emailSent === null
              ? errors.credits ?? ""
              : emailSent
                ? `Email sent to ${user.email ?? "the customer"}`
                : "Credit applied, but the email couldn't be sent"}
          </p>
          <button type="submit" className="v2-btn-primary h-9 py-0" disabled={working}>
            {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {flash.credits === "ok" ? "Updated" : "Apply"}
          </button>
        </div>
      </form>

      <section aria-labelledby="wallet-history">
        <h3 id="wallet-history" className="mb-2 text-sm font-semibold text-v2-ink">
          History
        </h3>
        {ledger == null ? (
          <p className="flex items-center gap-2 text-sm text-v2-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : ledger.length === 0 ? (
          <p className="text-sm text-v2-muted">No wallet changes yet.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <caption className="sr-only">Wallet history</caption>
              <thead className="sticky top-0 bg-v2-bg-subtle text-xs text-v2-muted">
                <tr>
                  <th scope="col" className="h-9 px-3 text-left font-semibold">
                    Date
                  </th>
                  <th scope="col" className="px-3 text-right font-semibold">
                    Change
                  </th>
                  <th scope="col" className="px-3 text-right font-semibold">
                    Balance after
                  </th>
                  <th scope="col" className="px-3 text-left font-semibold">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry.id} className="border-t border-gray-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2">
                      <time dateTime={entry.createdAt} title={fullDateTime(entry.createdAt)}>
                        {shortDate(entry.createdAt)}
                      </time>
                    </td>
                    <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", entry.delta >= 0 ? "text-emerald-700" : "text-red-700")}>
                      {signedMoney(entry.delta)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-v2-ink">{money(entry.balanceAfter)}</td>
                    <td className="px-3 py-2 text-v2-muted">{entry.note ?? entry.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
