"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Drawer } from "@/components/v2/admin/Drawer";
import { money, percent, usd4FromCents } from "@/components/v2/admin/format";
import { Callout, DefinitionList, MoneyInput, StatusPill, Switch } from "@/components/v2/admin/ui";
import {
  draftFor,
  isPrintItem,
  parseDraft,
  previewPrice,
  type Draft,
} from "@/components/v2/admin/pricing/pricingMath";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import type { ObservedAiCost, PriceItem, PriceSku, PrintCostSample } from "@/lib/pricing/types";

/** Edit one price: cost, markup, minimum, free uses and whether customers are charged, with a live preview. */
export function PriceEditorDrawer({
  item,
  observed,
  printCost,
  samplePages,
  onClose,
  onSaved,
}: {
  item: PriceItem;
  observed: ObservedAiCost | null;
  printCost: PrintCostSample | null;
  samplePages: number;
  onClose: () => void;
  onSaved: (item: PriceItem) => void;
}) {
  const saved = draftFor(item);
  const [draft, setDraft] = useState<Draft>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Take the server's values after a save unless the admin is mid-edit.
  const [lastItem, setLastItem] = useState(item);
  if (lastItem !== item) {
    setLastItem(item);
    setDraft(draftFor(item));
  }

  const isPrint = isPrintItem(item);
  const isAi = item.category === "ai";
  const parsed = parseDraft(draft, item);
  const preview = previewPrice(item, draft, observed, printCost);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const showFreeQuota = item.sku === "ai.sheet_edit" || item.freeQuota > 0;
  const fmtCost = isAi ? usd4FromCents : money;

  const set = (key: keyof Draft) => (value: string) => {
    setStatus(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  async function save() {
    if (!preview.valid || saving) return;
    setSaving(true);
    setError(null);
    const result = await api.adminUpdatePrice(item.sku as PriceSku, {
      ...(isPrint ? {} : { unitCostCents: parsed.cost! }),
      markupPct: parsed.markup!,
      minPriceCents: parsed.minPrice!,
      freeQuota: parsed.freeQuota!,
      billable: draft.billable,
    });
    setSaving(false);
    if (api.isError(result)) {
      setError(result.error.message);
      return;
    }
    setStatus("Saved. The new price applies to the next charge.");
    onSaved(result.data);
  }

  const id = item.sku.replace(/\./g, "-");
  const customerTotal =
    isPrint && preview.chargedCents != null && printCost?.shippingCents != null
      ? preview.chargedCents + printCost.shippingCents + (printCost.taxCents ?? 0)
      : null;

  return (
    <Drawer
      onClose={onClose}
      title={item.name}
      subtitle={item.description ?? undefined}
      footer={
        <>
          {status ? (
            <p role="status" className="mr-auto text-sm font-semibold text-v2-success-text">
              {status}
            </p>
          ) : null}
          <button type="button" className="v2-btn-outline" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reset
          </button>
          <button type="button" className="v2-btn-primary" disabled={!preview.valid || !dirty || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save price
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
          <div>
            <p className="text-sm font-semibold text-v2-ink">{isPrint ? "Apply markup" : "Charge customers"}</p>
            <p className="text-xs text-v2-muted">
              {isPrint
                ? "Off sells the book at what the printer charges us."
                : "Off makes it free; we still pay for every use."}
            </p>
          </div>
          <Switch
            checked={draft.billable}
            onChange={(next) => {
              setStatus(null);
              setDraft((d) => ({ ...d, billable: next }));
            }}
            label={`${isPrint ? "Apply markup to" : "Charge customers for"} ${item.name}`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="v2-label" htmlFor={`${id}-cost`}>
              Our cost
            </label>
            {isPrint ? (
              <p className="flex h-11 items-center text-sm font-semibold tabular-nums text-v2-ink">
                {printCost?.printCostCents != null ? (
                  `${money(printCost.printCostCents)} for ${samplePages} pages`
                ) : printCost?.error ? (
                  <span className="font-normal text-red-700">Lulu cost unavailable</span>
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-v2-primary" aria-label="Getting Lulu's cost" />
                )}
              </p>
            ) : (
              <MoneyInput id={`${id}-cost`} value={draft.cost} onChange={set("cost")} invalid={parsed.cost == null} />
            )}
            <p className="mt-1 text-xs text-v2-muted">
              {isPrint ? "Lulu's live quote for printing and their fee." : "Up to 4 decimal places, e.g. 0.0412."}
            </p>
          </div>
          <div>
            <label className="v2-label" htmlFor={`${id}-markup`}>
              Markup on cost (%)
            </label>
            <input
              id={`${id}-markup`}
              type="text"
              inputMode="decimal"
              className={cn("v2-input text-right tabular-nums", parsed.markup == null && "border-red-300")}
              aria-invalid={parsed.markup == null || undefined}
              value={draft.markup}
              onChange={(e) => set("markup")(e.target.value)}
            />
          </div>
          <div>
            <label className="v2-label" htmlFor={`${id}-min`}>
              Minimum price
            </label>
            <MoneyInput id={`${id}-min`} value={draft.minPrice} onChange={set("minPrice")} invalid={parsed.minPrice == null} />
            <p className="mt-1 text-xs text-v2-muted">The price never goes below this.</p>
          </div>
          {showFreeQuota ? (
            <div>
              <label className="v2-label" htmlFor={`${id}-free`}>
                Free per page
              </label>
              <input
                id={`${id}-free`}
                type="text"
                inputMode="numeric"
                className={cn("v2-input text-right tabular-nums", parsed.freeQuota == null && "border-red-300")}
                aria-invalid={parsed.freeQuota == null || undefined}
                value={draft.freeQuota}
                onChange={(e) => set("freeQuota")(e.target.value)}
              />
              <p className="mt-1 text-xs text-v2-muted">Uses included with each page before charging.</p>
            </div>
          ) : null}
        </div>

        {observed ? (
          <div className="rounded-xl bg-v2-bg-subtle p-4 text-sm">
            <p className="font-semibold text-v2-ink">
              What it really cost over 30 days ({observed.calls} call{observed.calls === 1 ? "" : "s"})
            </p>
            <p className="mt-1 tabular-nums text-v2-navy">
              Average {usd4FromCents(observed.avgCents)} · typical high {usd4FromCents(observed.p90Cents)} · highest{" "}
              {usd4FromCents(observed.maxCents)}
            </p>
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-v2-link hover:underline"
              onClick={() => set("cost")((observed.p90Cents / 100).toFixed(4))}
            >
              Use typical high as our cost
            </button>
          </div>
        ) : item.aiOperation ? (
          <p className="text-sm text-v2-muted">No calls recorded in the last 30 days.</p>
        ) : null}

        <div>
          <p className="mb-1 text-sm font-semibold text-v2-ink">Preview</p>
          <DefinitionList
            items={[
              {
                label: isPrint ? `Book price (${samplePages} pages)` : "Price",
                value: (
                  <>
                    {money(preview.chargedCents)}
                    {!draft.billable ? (
                      <span className="ml-1.5 align-middle">
                        <StatusPill tone="neutral">{isPrint ? "At cost" : "Free"}</StatusPill>
                      </span>
                    ) : null}
                  </>
                ),
              },
              { label: "Profit per sale", value: preview.profitCents == null ? "—" : fmtCost(preview.profitCents), tone: (preview.profitCents ?? 0) < 0 ? "bad" : "default" },
              { label: "Margin", value: percent(preview.marginPct), tone: preview.losing ? "bad" : "default" },
              ...(isPrint
                ? [
                    {
                      label: "Customer pays in total",
                      note:
                        printCost?.shippingCents != null
                          ? `Includes ${money(printCost.shippingCents)} shipping and ${money(printCost.taxCents ?? 0)} tax, passed through at cost`
                          : undefined,
                      value: money(customerTotal),
                    },
                  ]
                : [
                    {
                      label: "Charging now",
                      note: "The saved price",
                      value: item.listPriceCents == null ? "—" : money(item.billable ? item.listPriceCents : 0),
                    },
                  ]),
            ]}
          />
        </div>

        {preview.losing ? (
          <Callout tone="critical" title={draft.billable ? "This price is below what it usually costs us" : "Customers aren't charged for this"}>
            {draft.billable
              ? `A typical high cost is ${usd4FromCents(preview.worstCostCents)}. Raise our cost or the markup.`
              : `We absorb about ${usd4FromCents(preview.worstCostCents)} each time.`}
          </Callout>
        ) : null}
        {item.sku === "ai.sheet_edit" && parsed.freeQuota && preview.costCents != null ? (
          <p className="text-sm text-v2-muted">
            Free edits cost us up to {usd4FromCents(preview.worstCostCents * parsed.freeQuota)} per page, paid out of the
            page&apos;s own price.
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
