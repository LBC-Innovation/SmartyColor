"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { fullDateTime, money } from "@/components/v2/admin/format";
import { ErrorPanel, MoneyInput, Section } from "@/components/v2/admin/ui";
import * as api from "@/lib/api/client";
import { formatCredits, parseDollarsToCents } from "@/lib/credits/money";
import { MAX_WELCOME_CREDIT_CENTS, MAX_WELCOME_FREE_SHEETS, type PromoCreditSettings } from "@/lib/credits/types";
import type { FinanceReport } from "@/lib/finance/types";

type PromoField = "friend" | "sharer";

const FIELDS: Array<{ field: PromoField; title: string; description: string; cents: (s: PromoCreditSettings) => number }> = [
  {
    field: "friend",
    title: "Share with a friend: friend",
    description:
      "Given to the new account when it signs up through someone's Share with a friend link or QR code, once its email is confirmed. A new amount applies to sign-ups confirmed from now on.",
    cents: (s) => s.friendCreditCents,
  },
  {
    field: "sharer",
    title: "Share with a friend: sharer",
    description:
      "Given to the person who shared, each time a friend signs up through their link. A new amount applies to sign-ups confirmed from now on. Set both to $0.00 to stop the offer.",
    cents: (s) => s.sharerCreditCents,
  },
];

function last30Days(): { from: string; to: string } {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(today - 29 * 86_400_000), to: iso(today) };
}

/** Welcome and Share with a friend credit amounts, plus what promo credit has cost lately. */
export function PromotionsSection({ canEdit, canSeeFinance }: { canEdit: boolean; canSeeFinance: boolean }) {
  const [settings, setSettings] = useState<PromoCreditSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [finance, setFinance] = useState<FinanceReport | null>(null);

  useEffect(() => {
    if (!canEdit) return;
    let alive = true;
    void api.adminGetPromoCredits().then((r) => {
      if (!alive) return;
      if (api.isError(r)) setLoadError(r.error.message);
      else setSettings(r.data);
    });
    return () => {
      alive = false;
    };
  }, [canEdit]);

  useEffect(() => {
    if (!canSeeFinance) return;
    let alive = true;
    void api.adminGetFinance(last30Days()).then((r) => {
      if (alive && !api.isError(r)) setFinance(r.data);
    });
    return () => {
      alive = false;
    };
  }, [canSeeFinance]);

  return (
    <Section id="promotions" title="Promotions" description="Credit you give away automatically. It's spent like money but brings in no cash.">
      <div className="v2-panel overflow-hidden">
        {canEdit ? (
          loadError ? (
            <div className="p-4">
              <ErrorPanel>{loadError}</ErrorPanel>
            </div>
          ) : !settings ? (
            <p className="flex items-center gap-2 px-5 py-6 text-sm text-v2-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading promotions…
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              <WelcomeSheetsRow settings={settings} onSaved={setSettings} />
              {FIELDS.map((f) => (
                <PromoRow key={f.field} {...f} settings={settings} onSaved={setSettings} />
              ))}
            </ul>
          )
        ) : null}
        {finance ? (
          <div className="border-t border-gray-100 bg-v2-bg-subtle/60 px-5 py-4">
            <p className="text-xs font-semibold text-v2-muted">Last 30 days</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
              {[
                { label: "Granted", value: finance.current.customers.promoGrantedCents, note: "Welcome, referral and your grants" },
                { label: "Redeemed", value: finance.current.pnl.promoCents, note: "Spent by customers, so not revenue" },
                { label: "Still unspent", value: finance.balances.promoWalletCents, note: "Across all wallets today" },
                { label: "Est. cost to honor", value: finance.balances.promoCostExposureCents, note: "What redeeming it will cost us" },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="text-sm text-v2-muted">{s.label}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-v2-ink">{money(s.value)}</dd>
                  <p className="text-xs text-v2-muted">{s.note}</p>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function PromoRow({
  field,
  title,
  description,
  cents,
  settings,
  onSaved,
}: {
  field: PromoField;
  title: string;
  description: string;
  cents: (s: PromoCreditSettings) => number;
  settings: PromoCreditSettings;
  onSaved: (next: PromoCreditSettings) => void;
}) {
  const current = cents(settings);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const parsed = parseDollarsToCents(amount);
  const valid = parsed !== null && parsed >= 0 && parsed <= MAX_WELCOME_CREDIT_CENTS;

  function start() {
    setAmount((current / 100).toFixed(2));
    setError(null);
    setStatus(null);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const dollars = amount.trim();
    const result = await api.adminUpdatePromoCredits(
      field === "friend" ? { friendCreditDollars: dollars } : { sharerCreditDollars: dollars },
    );
    setSaving(false);
    if (api.isError(result)) {
      setError(result.error.message);
      return;
    }
    onSaved(result.data);
    setEditing(false);
    setStatus("Saved");
  }

  const inputId = `promo-${field}`;
  return (
    <li className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:gap-6">
      <div className="min-w-0 lg:w-48 lg:shrink-0">
        <p className="text-sm font-semibold text-v2-ink">{title}</p>
        {!editing ? (
          <p className="text-2xl font-semibold tabular-nums text-v2-ink">
            {current === 0 ? <span className="text-base text-v2-muted">Off</span> : formatCredits(current)}
          </p>
        ) : null}
      </div>
      {editing ? (
        <form onSubmit={save} className="flex flex-wrap items-start gap-2 lg:shrink-0">
          <div>
            <label htmlFor={inputId} className="sr-only">
              {title} amount
            </label>
            <MoneyInput id={inputId} value={amount} onChange={setAmount} invalid={!valid} className="w-32" />
            {!valid ? (
              <p className="mt-1 text-xs text-red-700">Between $0.00 and {formatCredits(MAX_WELCOME_CREDIT_CENTS)}.</p>
            ) : null}
          </div>
          <button type="submit" className="v2-btn-sm v2-btn-sm-primary h-11" disabled={!valid || saving || parsed === current}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Save
          </button>
          <button type="button" className="v2-btn-sm h-11 text-v2-muted" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : null}
      <div className="min-w-0 flex-1 text-sm text-v2-muted">
        <p>{description}</p>
        <p className="mt-0.5 text-xs">Last changed {fullDateTime(settings.updatedAt)}</p>
        {error ? (
          <p className="mt-1 text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {!editing ? (
        <div className="flex items-center gap-3 lg:shrink-0">
          {status ? (
            <span role="status" className="text-sm font-semibold text-v2-success-text">
              {status}
            </span>
          ) : null}
          <button type="button" className="v2-btn-sm v2-btn-sm-primary" onClick={start}>
            Edit
          </button>
        </div>
      ) : null}
    </li>
  );
}

function sheetsLabel(n: number): string {
  return `${n} free ${n === 1 ? "sheet" : "sheets"}`;
}

/**
 * The sign-up gift, set as a number of free sheets. The account is credited sheets × the current
 * sheet price when its email is confirmed, so the dollar value follows the sheet price.
 */
function WelcomeSheetsRow({
  settings,
  onSaved,
}: {
  settings: PromoCreditSettings;
  onSaved: (next: PromoCreditSettings) => void;
}) {
  const current = settings.welcomeFreeSheets;
  const price = settings.sheetPriceCents;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const trimmed = value.trim();
  const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  const valid = parsed !== null && parsed <= MAX_WELCOME_FREE_SHEETS;
  const worth = (sheets: number) => (price ? formatCredits(sheets * price) : null);

  function start() {
    setValue(String(current));
    setError(null);
    setStatus(null);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!valid || saving || parsed === null) return;
    setSaving(true);
    setError(null);
    const result = await api.adminUpdatePromoCredits({ welcomeFreeSheets: parsed });
    setSaving(false);
    if (api.isError(result)) {
      setError(result.error.message);
      return;
    }
    onSaved(result.data);
    setEditing(false);
    setStatus("Saved");
  }

  return (
    <li className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:gap-6">
      <div className="min-w-0 lg:w-48 lg:shrink-0">
        <p className="text-sm font-semibold text-v2-ink">Welcome free sheets</p>
        {!editing ? (
          current === 0 ? (
            <p className="text-base font-semibold text-v2-muted">Off</p>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums text-v2-ink">{sheetsLabel(current)}</p>
              {worth(current) ? <p className="text-xs tabular-nums text-v2-muted">Worth {worth(current)} today</p> : null}
            </>
          )
        ) : null}
      </div>
      {editing ? (
        <form onSubmit={save} className="flex flex-wrap items-start gap-2 lg:shrink-0">
          <div>
            <label htmlFor="promo-welcome" className="sr-only">
              Welcome free sheets
            </label>
            <input
              id="promo-welcome"
              type="text"
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!valid || undefined}
              aria-describedby="promo-welcome-hint"
              className={`v2-input w-32 text-right tabular-nums${valid ? "" : " border-red-300"}`}
            />
            <p id="promo-welcome-hint" className={`mt-1 text-xs ${valid ? "text-v2-muted" : "text-red-700"}`}>
              {!valid
                ? `A whole number from 0 to ${MAX_WELCOME_FREE_SHEETS}.`
                : parsed && worth(parsed)
                  ? `Credits ${worth(parsed)} today`
                  : parsed === 0
                    ? "0 turns the gift off"
                    : null}
            </p>
          </div>
          <button type="submit" className="v2-btn-sm v2-btn-sm-primary h-11" disabled={!valid || saving || parsed === current}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Save
          </button>
          <button type="button" className="v2-btn-sm h-11 text-v2-muted" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : null}
      <div className="min-w-0 flex-1 text-sm text-v2-muted">
        <p>
          Given once when a new account confirms its email: credit for this many new coloring sheets
          {price ? ` at today's sheet price (${formatCredits(price)} each)` : ""}. Sign-up offers across the site quote this
          number. A new number applies to accounts confirmed from now on.
        </p>
        <p className="mt-0.5 text-xs">Last changed {fullDateTime(settings.updatedAt)}</p>
        {error ? (
          <p className="mt-1 text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {!editing ? (
        <div className="flex items-center gap-3 lg:shrink-0">
          {status ? (
            <span role="status" className="text-sm font-semibold text-v2-success-text">
              {status}
            </span>
          ) : null}
          <button type="button" className="v2-btn-sm v2-btn-sm-primary" onClick={start}>
            Edit
          </button>
        </div>
      ) : null}
    </li>
  );
}
