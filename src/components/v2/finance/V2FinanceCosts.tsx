"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatCredits, parseDollarsToCents } from "@/lib/credits/money";
import {
  COST_CADENCES,
  COST_CATEGORIES,
  type CostCadence,
  type CostCategory,
  type FinanceCost,
  type FinanceCostInput,
  type FinanceSettings,
} from "@/lib/finance/types";

const categoryLabel = new Map<string, string>(COST_CATEGORIES.map((c) => [c.id, c.label]));
const cadenceLabel = new Map<string, string>(COST_CADENCES.map((c) => [c.id, c.label]));

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** What a cost runs per month, for comparing them side by side. */
function monthlyEquivalent(cost: FinanceCost): number | null {
  if (cost.cadence === "monthly") return cost.amountCents;
  if (cost.cadence === "annual") return cost.amountCents / 12;
  return null;
}

function isActive(cost: FinanceCost): boolean {
  const t = today();
  return cost.startsOn <= t && (cost.endsOn == null || cost.endsOn >= t);
}

type Draft = {
  name: string;
  vendor: string;
  category: CostCategory;
  cadence: CostCadence;
  amount: string;
  startsOn: string;
  endsOn: string;
  notes: string;
};

function draftFor(cost?: FinanceCost): Draft {
  return cost
    ? {
        name: cost.name,
        vendor: cost.vendor ?? "",
        category: cost.category,
        cadence: cost.cadence,
        amount: (cost.amountCents / 100).toFixed(2),
        startsOn: cost.startsOn,
        endsOn: cost.endsOn ?? "",
        notes: cost.notes ?? "",
      }
    : {
        name: "",
        vendor: "",
        category: "hosting",
        cadence: "monthly",
        amount: "",
        startsOn: `${today().slice(0, 8)}01`,
        endsOn: "",
        notes: "",
      };
}

/** The register of costs the app can't see, prorated into every period the dashboard shows. */
export function V2FinanceCosts({
  costs,
  canManage,
  onChanged,
}: {
  costs: FinanceCost[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeMonthly = costs
    .filter(isActive)
    .reduce((t, c) => t + (monthlyEquivalent(c) ?? 0), 0);

  async function remove(cost: FinanceCost) {
    if (!window.confirm(`Delete “${cost.name}”? To stop a recurring cost but keep its history, set an end date instead.`)) {
      return;
    }
    setDeleting(cost.id);
    setError(null);
    const result = await api.adminDeleteFinanceCost(cost.id);
    setDeleting(null);
    if (api.isError(result)) setError(result.error.message);
    else onChanged();
  }

  return (
    <div className="v2-panel p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-v2-ink">Fixed & operating costs</p>
          <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-v2-muted">
            Everything the business pays that the app doesn&apos;t record: hosting, subscriptions, marketing, payroll.
            Monthly and yearly costs are spread evenly over each day; one-time costs land on their date. Active
            recurring costs total <span className="font-semibold text-v2-ink">{formatCredits(activeMonthly)}</span> a
            month.
          </p>
        </div>
        {canManage && editing !== "new" ? (
          <button type="button" className="v2-btn-sm v2-btn-sm-primary" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add cost
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mb-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {editing === "new" ? (
        <CostForm
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}

      {costs.length === 0 ? (
        <p className="py-4 text-sm text-v2-muted">
          No costs entered yet. Start with the bills you pay every month (Vercel, Supabase, your domain, email, the
          AI provider&apos;s plan) so operating profit and break-even are real.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {costs.map((cost) =>
            editing === cost.id ? (
              <li key={cost.id} className="py-3">
                <CostForm
                  cost={cost}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    onChanged();
                  }}
                />
              </li>
            ) : (
              <li key={cost.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className={cn("font-semibold text-v2-ink", !isActive(cost) && "text-v2-muted")}>
                    {cost.name}
                    {cost.vendor ? <span className="font-normal text-v2-muted"> · {cost.vendor}</span> : null}
                    {!isActive(cost) ? (
                      <span className="ml-2 rounded bg-v2-bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-v2-muted">
                        {cost.startsOn > today() ? "Upcoming" : "Ended"}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-v2-muted">
                    {categoryLabel.get(cost.category)} · {cost.cadence === "one_time" ? "on" : "from"} {cost.startsOn}
                    {cost.endsOn ? ` to ${cost.endsOn}` : cost.cadence === "one_time" ? "" : ", ongoing"}
                    {cost.notes ? ` · ${cost.notes}` : ""}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="font-semibold text-v2-ink">
                    {formatCredits(cost.amountCents)}
                    <span className="font-normal text-v2-muted"> {cadenceLabel.get(cost.cadence)?.toLowerCase()}</span>
                  </p>
                  {cost.cadence === "annual" ? (
                    <p className="text-xs text-v2-muted">{formatCredits(cost.amountCents / 12)} / mo</p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="v2-btn-sm text-v2-muted"
                      onClick={() => setEditing(cost.id)}
                      aria-label={`Edit ${cost.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="v2-btn-sm text-v2-muted"
                      disabled={deleting === cost.id}
                      onClick={() => void remove(cost)}
                      aria-label={`Delete ${cost.name}`}
                    >
                      {deleting === cost.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function CostForm({
  cost,
  onCancel,
  onSaved,
}: {
  cost?: FinanceCost;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(cost));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = cost?.id ?? "new-cost";

  const amountCents = parseDollarsToCents(draft.amount);
  const valid =
    draft.name.trim().length > 0 &&
    amountCents != null &&
    amountCents >= 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(draft.startsOn) &&
    (draft.endsOn === "" || draft.endsOn >= draft.startsOn);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    if (!valid || amountCents == null) return;
    const input: FinanceCostInput = {
      name: draft.name.trim(),
      vendor: draft.vendor.trim() || null,
      category: draft.category,
      cadence: draft.cadence,
      amountCents,
      startsOn: draft.startsOn,
      endsOn: draft.cadence === "one_time" || !draft.endsOn ? null : draft.endsOn,
      notes: draft.notes.trim() || null,
    };
    setSaving(true);
    setError(null);
    const result = cost ? await api.adminUpdateFinanceCost(cost.id, input) : await api.adminCreateFinanceCost(input);
    setSaving(false);
    if (api.isError(result)) setError(result.error.message);
    else onSaved();
  }

  return (
    <form
      className="mb-3 rounded-xl bg-v2-bg-subtle p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="v2-label" htmlFor={`${id}-name`}>
            Name
          </label>
          <input
            id={`${id}-name`}
            className="v2-input"
            value={draft.name}
            maxLength={120}
            placeholder="e.g. Vercel Pro"
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
        </div>
        <div className="sm:col-span-2">
          <label className="v2-label" htmlFor={`${id}-vendor`}>
            Vendor <span className="font-normal text-v2-muted">(optional)</span>
          </label>
          <input
            id={`${id}-vendor`}
            className="v2-input"
            value={draft.vendor}
            maxLength={120}
            onChange={(e) => set("vendor", e.target.value)}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor={`${id}-category`}>
            Category
          </label>
          <select
            id={`${id}-category`}
            className="v2-input"
            value={draft.category}
            onChange={(e) => set("category", e.target.value as CostCategory)}
          >
            {COST_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="v2-label" htmlFor={`${id}-cadence`}>
            Paid
          </label>
          <select
            id={`${id}-cadence`}
            className="v2-input"
            value={draft.cadence}
            onChange={(e) => set("cadence", e.target.value as CostCadence)}
          >
            {COST_CADENCES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="v2-label" htmlFor={`${id}-amount`}>
            Amount ($)
          </label>
          <input
            id={`${id}-amount`}
            className="v2-input"
            inputMode="decimal"
            value={draft.amount}
            placeholder="20.00"
            onChange={(e) => set("amount", e.target.value)}
            aria-invalid={draft.amount !== "" && amountCents == null}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor={`${id}-start`}>
            {draft.cadence === "one_time" ? "Date" : "Starts"}
          </label>
          <input
            id={`${id}-start`}
            type="date"
            className="v2-input"
            value={draft.startsOn}
            onChange={(e) => set("startsOn", e.target.value)}
          />
        </div>
        {draft.cadence !== "one_time" ? (
          <div>
            <label className="v2-label" htmlFor={`${id}-end`}>
              Ends <span className="font-normal text-v2-muted">(optional)</span>
            </label>
            <input
              id={`${id}-end`}
              type="date"
              className="v2-input"
              value={draft.endsOn}
              min={draft.startsOn}
              onChange={(e) => set("endsOn", e.target.value)}
            />
          </div>
        ) : null}
        <div className={draft.cadence === "one_time" ? "sm:col-span-2 lg:col-span-3" : "sm:col-span-2 lg:col-span-2"}>
          <label className="v2-label" htmlFor={`${id}-notes`}>
            Notes <span className="font-normal text-v2-muted">(optional)</span>
          </label>
          <input
            id={`${id}-notes`}
            className="v2-input"
            value={draft.notes}
            maxLength={500}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="v2-btn-sm text-v2-muted" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={!valid || saving} className="v2-btn-sm v2-btn-sm-primary disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {cost ? "Save" : "Add cost"}
        </button>
      </div>
    </form>
  );
}

/** Card-fee rate (for estimating processing fees) and an opening cash balance (for cash on hand and runway). */
export function V2FinanceSettingsForm({
  settings,
  canManage,
  onSaved,
}: {
  settings: FinanceSettings;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [feePct, setFeePct] = useState(String(settings.cardFeePct));
  const [feeFixed, setFeeFixed] = useState((settings.cardFeeFixedCents / 100).toFixed(2));
  const [cash, setCash] = useState(settings.openingCashCents == null ? "" : (settings.openingCashCents / 100).toFixed(2));
  const [cashOn, setCashOn] = useState(settings.openingCashOn ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pctValue = /^\d+(\.\d{1,3})?$/.test(feePct.trim()) ? Number.parseFloat(feePct) : null;
  const fixedCents = parseDollarsToCents(feeFixed);
  const cashCents = cash.trim() === "" ? null : parseDollarsToCents(cash);
  const valid =
    pctValue != null &&
    pctValue <= 20 &&
    fixedCents != null &&
    fixedCents >= 0 &&
    fixedCents <= 1000 &&
    (cash.trim() === "") === (cashOn === "") &&
    (cash.trim() === "" || cashCents != null);

  async function save() {
    if (!valid || pctValue == null || fixedCents == null) return;
    setSaving(true);
    setError(null);
    const result = await api.adminUpdateFinanceSettings({
      cardFeePct: pctValue,
      cardFeeFixedCents: fixedCents,
      openingCashCents: cashCents,
      openingCashOn: cashOn || null,
    });
    setSaving(false);
    if (api.isError(result)) {
      setError(result.error.message);
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
    onSaved();
  }

  return (
    <div className="v2-panel p-4 sm:p-5">
      <p className="text-sm font-semibold text-v2-ink">Assumptions</p>
      <p className="mt-0.5 mb-3 max-w-xl text-xs leading-relaxed text-v2-muted">
        Card fees are estimated per top-up (Stripe&apos;s standard US rate is 2.9% + $0.30). Enter your bank balance on a
        known day to track cash on hand and runway; every cash flow after that day is added to it.
      </p>
      <fieldset disabled={!canManage} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="v2-label" htmlFor="fee-pct">
            Card fee (%)
          </label>
          <input id="fee-pct" className="v2-input" inputMode="decimal" value={feePct} onChange={(e) => setFeePct(e.target.value)} />
        </div>
        <div>
          <label className="v2-label" htmlFor="fee-fixed">
            Card fee per charge ($)
          </label>
          <input
            id="fee-fixed"
            className="v2-input"
            inputMode="decimal"
            value={feeFixed}
            onChange={(e) => setFeeFixed(e.target.value)}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor="cash">
            Bank balance ($)
          </label>
          <input
            id="cash"
            className="v2-input"
            inputMode="decimal"
            placeholder="Not tracked"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor="cash-on">
            Balance as of
          </label>
          <input id="cash-on" type="date" className="v2-input" value={cashOn} onChange={(e) => setCashOn(e.target.value)} />
        </div>
      </fieldset>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {canManage ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!valid || saving}
            onClick={() => void save()}
            className="v2-btn-sm v2-btn-sm-primary disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {saved ? "Saved" : "Save assumptions"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
