"use client";

import { useState } from "react";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { Drawer } from "@/components/v2/admin/Drawer";
import { money, shortDate } from "@/components/v2/admin/format";
import { EmptyState, MoneyInput, Section, StatusPill } from "@/components/v2/admin/ui";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { parseDollarsToCents } from "@/lib/credits/money";
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
  const [editing, setEditing] = useState<FinanceCost | "new" | null>(null);

  const activeMonthly = costs.filter(isActive).reduce((t, c) => t + (monthlyEquivalent(c) ?? 0), 0);

  const columns: Column<FinanceCost>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (c) => c.name.toLowerCase(),
      cell: (c) => (
        <span className="block min-w-0">
          <span className={cn("font-semibold text-v2-ink", !isActive(c) && "text-v2-muted")}>{c.name}</span>
          {!isActive(c) ? (
            <StatusPill tone="neutral" className="ml-2 h-5 align-middle">
              {c.startsOn > today() ? "Upcoming" : "Ended"}
            </StatusPill>
          ) : null}
          {c.notes ? <span className="block truncate text-xs text-v2-muted">{c.notes}</span> : null}
        </span>
      ),
      footer: "Active recurring, per month",
    },
    { key: "vendor", header: "Vendor", hideBelow: "lg", sortValue: (c) => c.vendor ?? "", cell: (c) => c.vendor ?? <span className="text-v2-muted">—</span> },
    { key: "category", header: "Category", hideBelow: "lg", sortValue: (c) => categoryLabel.get(c.category) ?? "", cell: (c) => categoryLabel.get(c.category) },
    { key: "cadence", header: "Every", cell: (c) => cadenceLabel.get(c.cadence) },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (c) => c.amountCents,
      cell: (c) => (
        <span>
          {money(c.amountCents)}
          {c.cadence === "annual" ? <span className="block text-xs text-v2-muted">{money(c.amountCents / 12)} / mo</span> : null}
        </span>
      ),
      footer: money(activeMonthly),
    },
    {
      key: "dates",
      header: "From – to",
      hideBelow: "md",
      sortValue: (c) => c.startsOn,
      cell: (c) => (
        <span className="whitespace-nowrap text-v2-muted">
          {shortDate(c.startsOn)}
          {c.cadence === "one_time" ? "" : ` – ${c.endsOn ? shortDate(c.endsOn) : "ongoing"}`}
        </span>
      ),
    },
  ];

  return (
    <Section
      title="Fixed & operating costs"
      description={
        <>
          What the business pays that the app doesn&apos;t record: hosting, subscriptions, marketing, payroll. Monthly
          and yearly costs are spread evenly over each day; one-time costs land on their date.
        </>
      }
      action={
        canManage ? (
          <button type="button" className="v2-btn-sm v2-btn-sm-primary" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add cost
          </button>
        ) : null
      }
    >
      <DataTable
        caption="Fixed and operating costs"
        columns={columns}
        rows={costs}
        rowKey={(c) => c.id}
        onRowClick={canManage ? (c) => setEditing(c) : undefined}
        rowLabel={(c) => `Edit ${c.name}`}
        showFooter
        defaultSort={{ key: "amount", dir: "desc" }}
        empty={
          <EmptyState icon={Receipt} title="No costs entered yet">
            Start with the bills you pay every month (hosting, database, your domain, email, the AI provider&apos;s
            plan) so operating profit and break-even are real.
          </EmptyState>
        }
      />
      {editing ? (
        <CostDrawer
          cost={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </Section>
  );
}

function CostDrawer({ cost, onClose, onSaved }: { cost?: FinanceCost; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(cost));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = cost?.id ?? "new-cost";
  const formId = `${id}-form`;

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

  async function remove() {
    if (!cost) return;
    setDeleting(true);
    setError(null);
    const result = await api.adminDeleteFinanceCost(cost.id);
    setDeleting(false);
    if (api.isError(result)) setError(result.error.message);
    else onSaved();
  }

  return (
    <Drawer
      onClose={onClose}
      title={cost ? cost.name : "Add a cost"}
      subtitle={cost ? `${categoryLabel.get(cost.category)} · ${cadenceLabel.get(cost.cadence)}` : "Something the business pays that the app can't see."}
      footer={
        <>
          {cost ? (
            confirmDelete ? (
              <span className="mr-auto flex items-center gap-2">
                <button type="button" className="v2-btn-sm text-v2-muted" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
                <button type="button" className="v2-btn-sm v2-btn-sm-danger" disabled={deleting} onClick={() => void remove()}>
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  Delete for good
                </button>
              </span>
            ) : (
              <button type="button" className="v2-btn-sm mr-auto text-red-700" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete
              </button>
            )
          ) : null}
          <button type="button" className="v2-btn-sm text-v2-muted" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={!valid || saving} className="v2-btn-sm v2-btn-sm-primary disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {cost ? "Save" : "Add cost"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
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
          />
        </div>
        <div className="sm:col-span-2">
          <label className="v2-label" htmlFor={`${id}-vendor`}>
            Vendor <span className="font-normal text-v2-muted">(optional)</span>
          </label>
          <input id={`${id}-vendor`} className="v2-input" value={draft.vendor} maxLength={120} onChange={(e) => set("vendor", e.target.value)} />
        </div>
        <div>
          <label className="v2-label" htmlFor={`${id}-category`}>
            Category
          </label>
          <select id={`${id}-category`} className="v2-input" value={draft.category} onChange={(e) => set("category", e.target.value as CostCategory)}>
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
          <select id={`${id}-cadence`} className="v2-input" value={draft.cadence} onChange={(e) => set("cadence", e.target.value as CostCadence)}>
            {COST_CADENCES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="v2-label" htmlFor={`${id}-amount`}>
            Amount
          </label>
          <MoneyInput
            id={`${id}-amount`}
            value={draft.amount}
            onChange={(v) => set("amount", v)}
            invalid={draft.amount !== "" && amountCents == null}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor={`${id}-start`}>
            {draft.cadence === "one_time" ? "Date" : "Starts"}
          </label>
          <input id={`${id}-start`} type="date" className="v2-input" value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
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
            <p className="mt-1 text-xs text-v2-muted">To stop a cost but keep its history, set an end date instead of deleting it.</p>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <label className="v2-label" htmlFor={`${id}-notes`}>
            Notes <span className="font-normal text-v2-muted">(optional)</span>
          </label>
          <input id={`${id}-notes`} className="v2-input" value={draft.notes} maxLength={500} onChange={(e) => set("notes", e.target.value)} />
        </div>
        {error ? (
          <p className="text-sm text-red-700 sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Drawer>
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
  const [storageRate, setStorageRate] = useState(String(settings.storageUsdPerGbMonth));
  const [includedGb, setIncludedGb] = useState(String(settings.storageIncludedGb));
  const [cash, setCash] = useState(settings.openingCashCents == null ? "" : (settings.openingCashCents / 100).toFixed(2));
  const [cashOn, setCashOn] = useState(settings.openingCashOn ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pctValue = /^\d+(\.\d{1,3})?$/.test(feePct.trim()) ? Number.parseFloat(feePct) : null;
  const fixedCents = parseDollarsToCents(feeFixed);
  const cashCents = cash.trim() === "" ? null : parseDollarsToCents(cash);
  const storageValue = /^\d+(\.\d{1,5})?$/.test(storageRate.trim()) ? Number.parseFloat(storageRate) : null;
  const includedValue = /^\d+(\.\d{1,3})?$/.test(includedGb.trim()) ? Number.parseFloat(includedGb) : null;
  const valid =
    pctValue != null &&
    pctValue <= 20 &&
    fixedCents != null &&
    fixedCents >= 0 &&
    fixedCents <= 1000 &&
    storageValue != null &&
    storageValue <= 10 &&
    includedValue != null &&
    includedValue <= 100000 &&
    (cash.trim() === "") === (cashOn === "") &&
    (cash.trim() === "" || cashCents != null);

  async function save() {
    if (!valid || pctValue == null || fixedCents == null || storageValue == null || includedValue == null) return;
    setSaving(true);
    setError(null);
    const result = await api.adminUpdateFinanceSettings({
      cardFeePct: pctValue,
      cardFeeFixedCents: fixedCents,
      storageUsdPerGbMonth: storageValue,
      storageIncludedGb: includedValue,
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
    <Section
      title="Assumptions"
      description={
        <>
          Card fees are estimated per top-up (Stripe&apos;s standard US rate is 2.9% + $0.30). Enter your bank balance on a
          known day to track cash on hand and runway; every cash flow after that day is added to it. The storage price
          sets what each customer&apos;s photos cost to keep (Supabase charges $0.021 per GB-month past the plan&apos;s
          included space; set what your plan includes so the Files page can warn before you pass it).
        </>
      }
    >
    <div className="v2-panel p-5">
      {!canManage ? <p className="mb-3 text-xs text-v2-muted">Read only: changing these needs the Manage financials permission.</p> : null}
      <fieldset disabled={!canManage} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <label className="v2-label" htmlFor="storage-rate">
            Image storage ($ per GB-month)
          </label>
          <input
            id="storage-rate"
            className="v2-input"
            inputMode="decimal"
            value={storageRate}
            onChange={(e) => setStorageRate(e.target.value)}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor="storage-included">
            Storage included in plan (GB)
          </label>
          <input
            id="storage-included"
            className="v2-input"
            inputMode="decimal"
            value={includedGb}
            onChange={(e) => setIncludedGb(e.target.value)}
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
    </Section>
  );
}
