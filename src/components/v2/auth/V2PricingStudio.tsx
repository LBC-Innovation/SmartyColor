"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { ADMIN_CONTENT_CLASS, V2AdminToolbar } from "@/components/v2/auth/V2AdminSubNav";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatCredits, parseDollarsToCents } from "@/lib/credits/money";
import {
  grossMarginPct,
  listPriceCents,
  MAX_FREE_QUOTA,
  MAX_MARKUP_PCT,
  MAX_MIN_PRICE_CENTS,
  type AdminPricingData,
  type ObservedAiCost,
  type PriceItem,
  type PriceSku,
  type PrintCostSample,
} from "@/lib/pricing/types";
import { refreshPriceList } from "@/lib/pricing/usePriceList";

/** Dollars with sub-cent precision, for AI costs like $0.1253. */
function usd4(cents: number): string {
  return `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(4)}`;
}

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

/** "0.1253" → 12.53 cents; up to 4 decimal places of a dollar. */
function parseCostDollars(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) return null;
  return Math.round(Number.parseFloat(trimmed) * 1_000_000) / 10_000;
}

function parsePercent(input: string): number | null {
  const trimmed = input.trim().replace(/%$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number.parseFloat(trimmed);
  return value <= MAX_MARKUP_PCT ? value : null;
}

type Draft = { cost: string; markup: string; minPrice: string; freeQuota: string; billable: boolean };

function draftFor(item: PriceItem): Draft {
  return {
    cost: item.unitCostCents == null ? "" : (item.unitCostCents / 100).toFixed(4),
    markup: String(item.markupPct),
    minPrice: (item.minPriceCents / 100).toFixed(2),
    freeQuota: String(item.freeQuota),
    billable: item.billable,
  };
}

type ParsedDraft = {
  cost: number | null;
  markup: number | null;
  minPrice: number | null;
  freeQuota: number | null;
};

function parseDraft(draft: Draft, item: PriceItem): ParsedDraft {
  const minPrice = parseDollarsToCents(draft.minPrice);
  const freeQuota = /^\d+$/.test(draft.freeQuota.trim()) ? Number.parseInt(draft.freeQuota, 10) : null;
  return {
    cost: item.costBasis === "fixed" ? parseCostDollars(draft.cost) : item.unitCostCents,
    markup: parsePercent(draft.markup),
    minPrice: minPrice != null && minPrice >= 0 && minPrice <= MAX_MIN_PRICE_CENTS ? minPrice : null,
    freeQuota: freeQuota != null && freeQuota <= MAX_FREE_QUOTA ? freeQuota : null,
  };
}

export function V2PricingStudio() {
  const [data, setData] = useState<AdminPricingData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [samplePages, setSamplePages] = useState(24);
  const [printCosts, setPrintCosts] = useState<PrintCostSample[] | null>(null);
  const [printCostError, setPrintCostError] = useState<string | null>(null);
  const [printCostsLoading, setPrintCostsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.adminGetPricing().then((result) => {
      if (cancelled) return;
      if (api.isError(result)) setLoadError(result.error.message);
      else setData(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      setPrintCostsLoading(true);
      void api.adminGetPrintCosts(samplePages).then((result) => {
        if (cancelled) return;
        setPrintCostsLoading(false);
        if (api.isError(result)) {
          setPrintCostError(result.error.message);
          setPrintCosts(null);
        } else {
          setPrintCostError(null);
          setPrintCosts(result.data);
        }
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [samplePages]);

  const observedByOperation = useMemo(
    () => new Map((data?.observedAiCosts ?? []).map((o) => [o.operation, o])),
    [data],
  );

  function onSaved(item: PriceItem) {
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.sku === item.sku ? item : i)) } : prev,
    );
    void refreshPriceList();
    void api.adminGetPricing().then((r) => {
      if (!api.isError(r)) setData(r.data);
    });
  }

  const groups: Array<{ title: string; blurb: string; category: PriceItem["category"] }> = [
    {
      title: "AI actions",
      blurb:
        "Charged from the wallet each time a customer uses them. Cost is what one call to the image model costs us; the observed cost is measured from every call in the last 30 days.",
      category: "ai",
    },
    {
      title: "Digital download",
      blurb: "The print-at-home PDF. It costs us almost nothing to make, so its price is usually set by the minimum.",
      category: "digital",
    },
    {
      title: "Printed books (Lulu)",
      blurb:
        "Priced per order from Lulu's live quote. The markup applies to the book (printing plus Lulu's fulfillment fee); shipping and sales tax are passed through at cost.",
      category: "print",
    },
  ];

  return (
    <V2StudioFrame>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <V2AdminToolbar />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <div className={`${ADMIN_CONTENT_CLASS} py-6 sm:py-8`}>
            <header className="mb-6">
              <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">Prices</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-v2-muted sm:text-base">
                Everything customers pay for. Each list price is our cost plus the markup you set,
                rounded up to the cent and never below the minimum. Changes apply to the next
                charge; the app, checkout and the wallet all read prices from here.
              </p>
            </header>

            {loadError ? (
              <p className="v2-panel p-4 text-sm text-red-700" role="alert">
                {loadError}
              </p>
            ) : !data ? (
              <div className="flex min-h-[20vh] items-center justify-center text-v2-muted">
                <Loader2 className="h-8 w-8 animate-spin text-v2-primary" aria-label="Loading" />
              </div>
            ) : (
              <div className="space-y-8">
                {groups.map((group) => (
                  <section key={group.category}>
                    <p className="v2-section-title mb-1">{group.title}</p>
                    <p className="mb-3 max-w-3xl text-xs leading-relaxed text-v2-muted">{group.blurb}</p>
                    {group.category === "print" ? (
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-v2-muted">
                        <label htmlFor="sample-pages">Costs shown for a book of</label>
                        <input
                          id="sample-pages"
                          type="number"
                          min={1}
                          max={800}
                          className="v2-input w-20"
                          value={samplePages}
                          onChange={(e) => {
                            const n = Number.parseInt(e.target.value, 10);
                            if (Number.isInteger(n) && n >= 1 && n <= 800) setSamplePages(n);
                          }}
                        />
                        <span>pages, shipped by mail to the quote address.</span>
                        {printCostsLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-v2-primary" aria-label="Getting Lulu costs" />
                        ) : null}
                      </div>
                    ) : null}
                    {group.category === "print" && printCostError ? (
                      <p className="mb-3 text-sm text-red-700" role="alert">
                        Lulu costs unavailable: {printCostError}
                      </p>
                    ) : null}
                    <div className="space-y-3">
                      {data.items
                        .filter((item) => item.category === group.category)
                        .map((item) => (
                          <PriceRow
                            key={item.sku}
                            item={item}
                            observed={item.aiOperation ? observedByOperation.get(item.aiOperation) ?? null : null}
                            printCost={printCosts?.find((c) => c.sku === item.sku) ?? null}
                            onSaved={onSaved}
                          />
                        ))}
                    </div>
                  </section>
                ))}

                <ChangeLog data={data} />
              </div>
            )}
          </div>
        </main>
      </div>
    </V2StudioFrame>
  );
}

function PriceRow({
  item,
  observed,
  printCost,
  onSaved,
}: {
  item: PriceItem;
  observed: ObservedAiCost | null;
  printCost: PrintCostSample | null;
  onSaved: (item: PriceItem) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(item));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Take the server's values after a save (or a reload) unless the admin is mid-edit.
  const savedDraft = useMemo(() => draftFor(item), [item]);
  const [lastItem, setLastItem] = useState(item);
  if (lastItem !== item) {
    setLastItem(item);
    setDraft(savedDraft);
  }

  const parsed = parseDraft(draft, item);
  const isPrint = item.costBasis === "lulu_quote";
  const showFreeQuota = item.sku === "ai.sheet_edit" || item.freeQuota > 0;
  const valid =
    parsed.markup != null &&
    parsed.minPrice != null &&
    parsed.freeQuota != null &&
    (isPrint || parsed.cost != null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);

  // The cost the price is worked out from: our unit cost, or Lulu's cost for the sample book.
  const costCents = isPrint ? (printCost?.printCostCents ?? null) : parsed.cost;
  const listCents =
    costCents != null && parsed.markup != null && parsed.minPrice != null
      ? listPriceCents(costCents, parsed.markup, parsed.minPrice)
      : null;
  // Off means free for AI and the PDF; a printed book still has to pay the printer, so it sells at cost.
  const chargedCents = listCents == null ? null : draft.billable ? listCents : isPrint ? costCents : 0;
  const markupCents = chargedCents != null && costCents != null ? chargedCents - costCents : null;
  const margin = chargedCents != null && costCents != null ? grossMarginPct(costCents, chargedCents) : null;

  // The price must cover what a call usually costs us, not just the number typed as cost.
  const worstCost = Math.max(costCents ?? 0, observed?.p90Cents ?? 0);
  const losing = chargedCents != null && chargedCents < worstCost;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await api.adminUpdatePrice(item.sku as PriceSku, {
      ...(isPrint ? {} : { unitCostCents: parsed.cost! }),
      markupPct: parsed.markup!,
      minPriceCents: parsed.minPrice!,
      freeQuota: parsed.freeQuota!,
      billable: draft.billable,
    });
    setSaving(false);
    if (api.isError(result)) {
      setSaveError(result.error.message);
      return;
    }
    onSaved(result.data);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  const id = item.sku.replace(/\./g, "-");
  const field = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <div className={cn("v2-panel p-4", losing && "ring-1 ring-red-200")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-v2-ink">{item.name}</p>
          {item.description ? <p className="mt-0.5 text-xs text-v2-muted">{item.description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-v2-muted">
            {isPrint ? "Apply markup" : "Charge customers"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={draft.billable}
            aria-label={`${isPrint ? "Apply markup to" : "Charge customers for"} ${item.name}`}
            onClick={() => setDraft((d) => ({ ...d, billable: !d.billable }))}
            className={cn(
              "v2-hit relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors",
              draft.billable ? "border-v2-primary bg-v2-primary" : "border-gray-300 bg-gray-200",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform",
                draft.billable ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="v2-label" htmlFor={`${id}-cost`}>
            Our cost (COGS)
          </label>
          {isPrint ? (
            <p className="flex h-10 items-center text-sm font-semibold tabular-nums text-v2-ink">
              {printCost?.printCostCents != null ? (
                formatCredits(printCost.printCostCents)
              ) : printCost?.error ? (
                <span className="text-xs font-normal text-red-700">Unavailable</span>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-v2-primary" aria-label="Loading" />
              )}
            </p>
          ) : (
            <input
              id={`${id}-cost`}
              type="text"
              inputMode="decimal"
              className="v2-input"
              value={draft.cost}
              onChange={field("cost")}
              aria-invalid={parsed.cost == null}
            />
          )}
        </div>
        <div>
          <label className="v2-label" htmlFor={`${id}-markup`}>
            Markup on cost (%)
          </label>
          <input
            id={`${id}-markup`}
            type="text"
            inputMode="decimal"
            className="v2-input"
            value={draft.markup}
            onChange={field("markup")}
            aria-invalid={parsed.markup == null}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor={`${id}-min`}>
            Minimum price
          </label>
          <input
            id={`${id}-min`}
            type="text"
            inputMode="decimal"
            className="v2-input"
            value={draft.minPrice}
            onChange={field("minPrice")}
            aria-invalid={parsed.minPrice == null}
          />
        </div>
        {showFreeQuota ? (
          <div>
            <label className="v2-label" htmlFor={`${id}-free`}>
              Free per sheet
            </label>
            <input
              id={`${id}-free`}
              type="text"
              inputMode="numeric"
              className="v2-input"
              value={draft.freeQuota}
              onChange={field("freeQuota")}
              aria-invalid={parsed.freeQuota == null}
            />
          </div>
        ) : null}
      </div>

      {observed ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-v2-muted">
          <span>
            Observed (30 days, {observed.calls} call{observed.calls === 1 ? "" : "s"}): avg {usd4(observed.avgCents)} ·
            90th percentile {usd4(observed.p90Cents)} · max {usd4(observed.maxCents)}
          </span>
          <button
            type="button"
            className="font-semibold text-v2-link hover:underline"
            onClick={() => setDraft((d) => ({ ...d, cost: (observed.p90Cents / 100).toFixed(4) }))}
          >
            Use 90th percentile
          </button>
        </p>
      ) : item.aiOperation ? (
        <p className="mt-2 text-xs text-v2-muted">No calls recorded in the last 30 days.</p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-v2-bg-subtle p-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-v2-muted">Markup</dt>
          <dd className="font-semibold tabular-nums text-v2-ink">
            {markupCents == null ? "—" : isPrint ? formatCredits(markupCents) : usd4(markupCents)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-v2-muted">{isPrint ? "Book list price" : "List price"}</dt>
          <dd className="font-semibold tabular-nums text-v2-ink">
            {chargedCents == null ? "—" : formatCredits(chargedCents)}
            {!draft.billable ? (
              <span className="ml-1 text-xs font-normal text-v2-muted">{isPrint ? "(at cost)" : "(free)"}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-v2-muted">Gross margin</dt>
          <dd className={cn("font-semibold tabular-nums", losing ? "text-red-700" : "text-v2-ink")}>{pct(margin)}</dd>
        </div>
        {isPrint ? (
          <div>
            <dt className="text-xs text-v2-muted">Customer total ({printCost?.pageCount ?? "—"} pages)</dt>
            <dd className="font-semibold tabular-nums text-v2-ink">
              {chargedCents != null && printCost?.shippingCents != null
                ? formatCredits(chargedCents + printCost.shippingCents + (printCost.taxCents ?? 0))
                : "—"}
              {printCost?.shippingCents != null ? (
                <span className="block text-xs font-normal text-v2-muted">
                  incl. {formatCredits(printCost.shippingCents)} shipping, {formatCredits(printCost.taxCents ?? 0)} tax
                </span>
              ) : null}
            </dd>
          </div>
        ) : (
          <div>
            <dt className="text-xs text-v2-muted">Now charging</dt>
            <dd className="font-semibold tabular-nums text-v2-ink">
              {item.listPriceCents == null ? "—" : formatCredits(item.billable ? item.listPriceCents : 0)}
            </dd>
          </div>
        )}
      </dl>

      {losing ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-red-700" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {draft.billable
            ? `This price is below what a call usually costs us (${usd4(worstCost)}). Raise the cost or markup.`
            : `Customers aren't charged; we absorb about ${usd4(worstCost)} each time.`}
        </p>
      ) : null}
      {item.sku === "ai.sheet_edit" && parsed.freeQuota && costCents != null ? (
        <p className="mt-2 text-xs text-v2-muted">
          Free edits cost us up to {usd4(worstCost * parsed.freeQuota)} per sheet, paid out of the sheet&apos;s
          own price.
        </p>
      ) : null}

      {saveError ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {dirty ? (
          <button type="button" className="v2-btn-sm text-v2-muted" onClick={() => setDraft(savedDraft)}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset
          </button>
        ) : null}
        <button
          type="button"
          disabled={!valid || !dirty || saving}
          onClick={() => void save()}
          className="v2-btn-sm v2-btn-sm-primary disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}

function describeChange(oldValues: Record<string, unknown> | null, newValues: Record<string, unknown>): string {
  const labels: Record<string, (v: unknown) => string> = {
    unit_cost_cents: (v) => (v == null ? "—" : usd4(Number(v))),
    markup_pct: (v) => `${Number(v)}%`,
    min_price_cents: (v) => formatCredits(Number(v)),
    free_quota: (v) => String(v),
    billable: (v) => (v ? "on" : "off"),
    list_price_cents: (v) => (v == null ? "—" : formatCredits(Number(v))),
  };
  const names: Record<string, string> = {
    unit_cost_cents: "cost",
    markup_pct: "markup",
    min_price_cents: "minimum",
    free_quota: "free uses",
    billable: "charging",
    list_price_cents: "list price",
  };
  return Object.keys(labels)
    .filter((k) => JSON.stringify(oldValues?.[k]) !== JSON.stringify(newValues[k]))
    .map((k) => `${names[k]} ${labels[k](oldValues?.[k])} → ${labels[k](newValues[k])}`)
    .join(", ");
}

function ChangeLog({ data }: { data: AdminPricingData }) {
  const names = new Map(data.items.map((i) => [i.sku, i.name]));
  return (
    <section>
      <p className="v2-section-title mb-3">Recent changes</p>
      {data.changes.length === 0 ? (
        <p className="text-sm text-v2-muted">No price changes yet.</p>
      ) : (
        <ul className="v2-panel divide-y divide-gray-100">
          {data.changes.map((c) => (
            <li key={c.id} className="px-4 py-3 text-sm">
              <p className="font-semibold text-v2-ink">{names.get(c.sku) ?? c.sku}</p>
              <p className="text-xs text-v2-muted">{describeChange(c.oldValues, c.newValues)}</p>
              <p className="mt-0.5 text-xs text-v2-muted">
                {new Date(c.changedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                {c.changedByEmail ? ` · ${c.changedByEmail}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
