"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { fullDateTime, money, percent, relativeTime, usd4FromCents } from "@/components/v2/admin/format";
import { PriceEditorDrawer } from "@/components/v2/admin/pricing/PriceEditorDrawer";
import { draftFor, isPrintItem, previewPrice, type PricePreview } from "@/components/v2/admin/pricing/pricingMath";
import { PackagesSection } from "@/components/v2/admin/pricing/PackagesSection";
import { PromotionsSection } from "@/components/v2/admin/pricing/PromotionsSection";
import {
  AttentionList,
  ErrorPanel,
  PageHeader,
  PageLoading,
  RefreshButton,
  Section,
  StatusPill,
} from "@/components/v2/admin/ui";
import { useUrlParam } from "@/components/v2/admin/useUrlParam";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";
import type { AdminPricingData, ObservedAiCost, PriceItem, PrintCostSample } from "@/lib/pricing/types";
import { refreshPriceList } from "@/lib/pricing/usePriceList";

type Row = {
  item: PriceItem;
  observed: ObservedAiCost | null;
  printCost: PrintCostSample | null;
  preview: PricePreview;
};

const GROUPS: Array<{ category: PriceItem["category"]; title: string; description: string }> = [
  {
    category: "ai",
    title: "Coloring pages & edits",
    description: "Charged from the wallet each time a customer uses them. Our cost is what one call to the image service costs.",
  },
  {
    category: "digital",
    title: "Print at home",
    description: "The printable PDF. It costs almost nothing to make, so the minimum usually sets its price.",
  },
  {
    category: "print",
    title: "Printed books",
    description: "Priced per order from Lulu's live quote. The markup applies to the book; shipping and tax pass through at cost.",
  },
];

function describeChange(oldValues: Record<string, unknown> | null, newValues: Record<string, unknown>): string {
  const labels: Record<string, (v: unknown) => string> = {
    unit_cost_cents: (v) => (v == null ? "—" : usd4FromCents(Number(v))),
    markup_pct: (v) => `${Number(v)}%`,
    min_price_cents: (v) => formatCredits(Number(v)),
    free_quota: (v) => String(v),
    billable: (v) => (v ? "on" : "off"),
    list_price_cents: (v) => (v == null ? "—" : formatCredits(Number(v))),
  };
  const names: Record<string, string> = {
    unit_cost_cents: "our cost",
    markup_pct: "markup",
    min_price_cents: "minimum",
    free_quota: "free uses",
    billable: "charging",
    list_price_cents: "price",
  };
  return Object.keys(labels)
    .filter((k) => JSON.stringify(oldValues?.[k]) !== JSON.stringify(newValues[k]))
    .map((k) => `${names[k]} ${labels[k](oldValues?.[k])} → ${labels[k](newValues[k])}`)
    .join(", ");
}

export function PricingStudio() {
  const { user } = useAuth();
  const canPrices = user?.permissions.includes("pricing:manage") ?? false;
  const canPromos = user?.permissions.includes("usermanage:adjustcredits") ?? false;
  const canFinance = user?.permissions.includes("finance:view") ?? false;

  const [data, setData] = useState<AdminPricingData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(canPrices);
  const [samplePages, setSamplePages] = useState(24);
  const [pagesInput, setPagesInput] = useState("24");
  const [printCosts, setPrintCosts] = useState<PrintCostSample[] | null>(null);
  const [printCostError, setPrintCostError] = useState<string | null>(null);
  const [printCostsLoading, setPrintCostsLoading] = useState(false);
  const [itemSku, setItemSku] = useUrlParam("item");

  const loadPricing = useCallback(async () => {
    const result = await api.adminGetPricing();
    setLoading(false);
    if (api.isError(result)) setLoadError(result.error.message);
    else {
      setLoadError(null);
      setData(result.data);
    }
  }, []);

  useEffect(() => {
    if (!canPrices) return;
    let alive = true;
    void api.adminGetPricing().then((result) => {
      if (!alive) return;
      setLoading(false);
      if (api.isError(result)) setLoadError(result.error.message);
      else setData(result.data);
    });
    return () => {
      alive = false;
    };
  }, [canPrices]);

  // Lulu's live cost for a sample book; debounced while the page count is typed.
  useEffect(() => {
    if (!canPrices) return;
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
  }, [samplePages, canPrices]);

  // The page may open at #promotions (the old Promo credits link); scroll once the section exists.
  useEffect(() => {
    if (window.location.hash !== "#promotions") return;
    const t = window.setTimeout(() => document.getElementById("promotions")?.scrollIntoView({ block: "start" }), 300);
    return () => window.clearTimeout(t);
  }, [data]);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const observedBy = new Map(data.observedAiCosts.map((o) => [o.operation, o]));
    return data.items.map((item) => {
      const observed = item.aiOperation ? (observedBy.get(item.aiOperation) ?? null) : null;
      const printCost = printCosts?.find((c) => c.sku === item.sku) ?? null;
      return { item, observed, printCost, preview: previewPrice(item, draftFor(item), observed, printCost) };
    });
  }, [data, printCosts]);

  const losing = rows.filter((r) => r.preview.losing);
  const selected = rows.find((r) => r.item.sku === itemSku) ?? null;

  function onSaved(item: PriceItem) {
    setData((prev) => (prev ? { ...prev, items: prev.items.map((i) => (i.sku === item.sku ? item : i)) } : prev));
    void refreshPriceList();
    void loadPricing();
  }

  function refresh() {
    if (!canPrices) return;
    setLoading(true);
    void loadPricing();
  }

  const columns = (category: PriceItem["category"]): Column<Row>[] => {
    const isAi = category === "ai";
    const isPrint = category === "print";
    const cost = (cents: number | null) => (isAi ? usd4FromCents(cents) : money(cents));
    return [
      {
        key: "item",
        header: "Item",
        cell: (r) => (
          <span className="block min-w-0">
            <span className="block font-semibold text-v2-ink">{r.item.name}</span>
            {r.item.description ? <span className="block max-w-md truncate text-xs text-v2-muted">{r.item.description}</span> : null}
            {r.item.freeQuota > 0 ? <span className="block text-xs text-v2-muted">{r.item.freeQuota} free per page</span> : null}
          </span>
        ),
        sortValue: (r) => r.item.name,
      },
      {
        key: "cost",
        header: isPrint ? `Our cost (${samplePages} pp)` : "Our cost",
        align: "right",
        cell: (r) =>
          isPrint && r.preview.costCents == null ? (
            r.printCost?.error ? (
              <span className="text-xs text-red-700">Unavailable</span>
            ) : (
              <Loader2 className="ml-auto h-4 w-4 animate-spin text-v2-primary" aria-label="Getting Lulu's cost" />
            )
          ) : (
            cost(r.preview.costCents)
          ),
        sortValue: (r) => r.preview.costCents,
      },
      { key: "markup", header: "Markup", align: "right", hideBelow: "md", cell: (r) => `${r.item.markupPct}%`, sortValue: (r) => r.item.markupPct },
      { key: "min", header: "Minimum", align: "right", hideBelow: "lg", cell: (r) => money(r.item.minPriceCents), sortValue: (r) => r.item.minPriceCents },
      {
        key: "price",
        header: "Price",
        align: "right",
        cell: (r) =>
          !r.item.billable ? (
            <span className="text-v2-muted">{isPrint ? `At cost${r.preview.chargedCents != null ? ` · ${money(r.preview.chargedCents)}` : ""}` : "Free"}</span>
          ) : (
            <span className="font-semibold text-v2-ink">{money(r.preview.chargedCents)}</span>
          ),
        sortValue: (r) => r.preview.chargedCents,
      },
      {
        key: "margin",
        header: "Margin",
        align: "right",
        cell: (r) =>
          r.preview.losing ? (
            // The margin on the entered cost looks healthy here, but a typical call costs more than the price.
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-red-700"
              title={`Margin on the entered cost: ${percent(r.preview.marginPct)}. Typical high cost per call: ${usd4FromCents(r.preview.worstCostCents)}.`}
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {r.preview.chargedCents ? "Below cost" : "Free, costs us"}
            </span>
          ) : (
            percent(r.preview.marginPct)
          ),
        sortValue: (r) => r.preview.marginPct,
      },
      {
        key: "charging",
        header: isPrint ? "Markup on" : "Charging",
        cell: (r) => <StatusPill tone={r.item.billable ? "good" : "neutral"}>{r.item.billable ? "On" : "Off"}</StatusPill>,
        sortValue: (r) => (r.item.billable ? 1 : 0),
      },
    ];
  };

  const names = new Map((data?.items ?? []).map((i) => [i.sku, i.name]));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pricing & promos"
        description="What customers pay, what it costs you, and the credit you give away."
        actions={canPrices ? <RefreshButton onClick={refresh} loading={loading} /> : undefined}
      />

      {canPrices ? (
        loadError ? (
          <ErrorPanel>{loadError}</ErrorPanel>
        ) : !data ? (
          <PageLoading label="Loading prices" />
        ) : (
          <>
            {losing.length ? (
              <AttentionList
                items={losing.map((r) => ({
                  tone: r.item.billable ? "critical" : "warning",
                  title: r.item.billable ? `${r.item.name} is priced below cost` : `${r.item.name} is free to customers`,
                  detail: r.item.billable
                    ? `Charging ${money(r.preview.chargedCents)}; a typical high cost is ${isPrintItem(r.item) ? money(r.preview.worstCostCents) : usd4FromCents(r.preview.worstCostCents)}.`
                    : `We absorb about ${usd4FromCents(r.preview.worstCostCents)} each time.`,
                  onClick: () => setItemSku(r.item.sku),
                  actionLabel: "Fix",
                }))}
              />
            ) : null}

            {GROUPS.map((group) => {
              const groupRows = rows.filter((r) => r.item.category === group.category);
              if (groupRows.length === 0) return null;
              const isPrint = group.category === "print";
              return (
                <Section
                  key={group.category}
                  id={`prices-${group.category}`}
                  title={group.title}
                  description={group.description}
                  action={
                    isPrint ? (
                      <div className="flex items-center gap-2 text-sm text-v2-muted">
                        <label htmlFor="sample-pages">Costs for a book of</label>
                        <input
                          id="sample-pages"
                          type="text"
                          inputMode="numeric"
                          className={cn("v2-input h-9 w-20 py-0 text-right text-sm tabular-nums")}
                          value={pagesInput}
                          onChange={(e) => {
                            setPagesInput(e.target.value);
                            const n = Number.parseInt(e.target.value, 10);
                            if (Number.isInteger(n) && n >= 1 && n <= 800) setSamplePages(n);
                          }}
                        />
                        <span>pages</span>
                        {printCostsLoading ? <Loader2 className="h-4 w-4 animate-spin text-v2-primary" aria-label="Getting Lulu's costs" /> : null}
                      </div>
                    ) : undefined
                  }
                >
                  {isPrint && printCostError ? (
                    <p className="mb-3 text-sm text-red-700" role="alert">
                      Lulu&apos;s costs are unavailable right now: {printCostError}
                    </p>
                  ) : null}
                  <DataTable
                    caption={`${group.title} prices`}
                    columns={columns(group.category)}
                    rows={groupRows}
                    rowKey={(r) => r.item.sku}
                    onRowClick={(r) => setItemSku(r.item.sku)}
                    rowLabel={(r) => `Edit the price of ${r.item.name}`}
                    selectedKey={itemSku}
                  />
                </Section>
              );
            })}
          </>
        )
      ) : null}

      {canPrices ? <PackagesSection /> : null}

      {canPromos || canFinance ? <PromotionsSection canEdit={canPromos} canSeeFinance={canFinance} /> : null}

      {canPrices && data ? (
        <details className="v2-panel p-5">
          <summary className="cursor-pointer text-sm font-semibold text-v2-ink">
            Change history <span className="font-normal text-v2-muted">(latest {Math.min(20, data.changes.length)})</span>
          </summary>
          {data.changes.length === 0 ? (
            <p className="mt-3 text-sm text-v2-muted">No price changes yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Recent price changes</caption>
                <thead>
                  <tr className="text-left text-xs text-v2-muted">
                    <th scope="col" className="py-2 pr-4 font-semibold">When</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Item</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">What changed</th>
                    <th scope="col" className="py-2 font-semibold">By</th>
                  </tr>
                </thead>
                <tbody>
                  {data.changes.slice(0, 20).map((c) => (
                    <tr key={c.id} className="border-t border-gray-100 align-top text-v2-navy">
                      <td className="whitespace-nowrap py-2 pr-4">
                        <time dateTime={c.changedAt} title={fullDateTime(c.changedAt)}>
                          {relativeTime(c.changedAt)}
                        </time>
                      </td>
                      <td className="py-2 pr-4 font-semibold text-v2-ink">{names.get(c.sku) ?? c.sku}</td>
                      <td className="py-2 pr-4">{describeChange(c.oldValues, c.newValues) || "No visible change"}</td>
                      <td className="py-2 text-v2-muted">{c.changedByEmail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      ) : null}

      {selected ? (
        <PriceEditorDrawer
          key={selected.item.sku}
          item={selected.item}
          observed={selected.observed}
          printCost={selected.printCost}
          samplePages={samplePages}
          onClose={() => setItemSku(null)}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}
