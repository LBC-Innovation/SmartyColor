"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { Drawer } from "@/components/v2/admin/Drawer";
import { money } from "@/components/v2/admin/format";
import { Callout, ErrorPanel, MoneyInput, Section, StatusPill, Switch } from "@/components/v2/admin/ui";
import { useAuth } from "@/context/AuthContext";
import { adminGetPrintCosts, isError } from "@/lib/api/client";
import { adminListBookPackages, adminUpdateBookPackage } from "@/lib/bookPackages/client";
import { packagePrintFit, type AdminBookPackage } from "@/lib/bookPackages/types";
import { parseDollarsToCents, formatCredits } from "@/lib/credits/money";
import { sheetUsageCostCents } from "@/lib/credits/pricing";
import { usePriceList } from "@/lib/pricing/usePriceList";
import { BOOK_BINDINGS } from "@/lib/print/bookBindings";

function statusOf(p: AdminBookPackage): { tone: "good" | "warn" | "neutral"; label: string } {
  if (!p.active) return { tone: "neutral", label: "Off" };
  if (p.priceCents == null) return { tone: "warn", label: "Hidden: no price" };
  if (!p.fits) return { tone: "warn", label: "Hidden: does not fit" };
  return { tone: "good", label: "Live" };
}

/** Book packages on /admin/pricing: what each binding's package includes and costs. */
export function PackagesSection() {
  const [rows, setRows] = useState<AdminBookPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminBookPackage["bindingId"] | null>(null);

  const load = useCallback(async () => {
    const res = await adminListBookPackages();
    if (isError(res)) setError(res.error.message);
    else {
      setError(null);
      setRows(res.data);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void adminListBookPackages().then((res) => {
      if (!alive) return;
      if (isError(res)) setError(res.error.message);
      else setRows(res.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const columns: Column<AdminBookPackage>[] = [
    {
      key: "binding",
      header: "Binding",
      cell: (r) => (
        <span className="block">
          <span className="block font-semibold text-v2-ink">{BOOK_BINDINGS[r.bindingId].shortLabel}</span>
          <span className="block font-mono text-xs text-v2-muted">{r.bindingId}</span>
        </span>
      ),
      sortValue: (r) => r.bindingId,
    },
    { key: "photos", header: "Photos", align: "right", cell: (r) => r.includedPhotos, sortValue: (r) => r.includedPhotos },
    { key: "edits", header: "Touch-ups each", align: "right", hideBelow: "md", cell: (r) => r.editsPerPhoto, sortValue: (r) => r.editsPerPhoto },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: (r) => (r.priceCents == null ? <span className="text-v2-muted">None</span> : <span className="font-semibold text-v2-ink">{money(r.priceCents)}</span>),
      sortValue: (r) => r.priceCents,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => {
        const s = statusOf(r);
        return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
      },
    },
    { key: "order", header: "Order", align: "right", hideBelow: "lg", cell: (r) => r.sortOrder, sortValue: (r) => r.sortOrder },
  ];

  const selected = rows?.find((r) => r.bindingId === editing) ?? null;

  return (
    <Section
      id="packages"
      title="Book packages"
      description="A book customers buy up front: photos, touch-ups and printing for one album. A package with no price stays hidden. Shipping is never included."
    >
      {error ? (
        <ErrorPanel>{error}</ErrorPanel>
      ) : !rows ? (
        <div className="flex items-center gap-2 text-sm text-v2-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading packages
        </div>
      ) : (
        <DataTable
          caption="Book packages"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.bindingId}
          onRowClick={(r) => setEditing(r.bindingId)}
          rowLabel={(r) => `Edit the ${BOOK_BINDINGS[r.bindingId].shortLabel} package`}
          selectedKey={editing}
        />
      )}
      {selected ? (
        <PackageDrawer
          key={selected.bindingId}
          pkg={selected}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </Section>
  );
}

function PackageDrawer({
  pkg,
  onClose,
  onSaved,
}: {
  pkg: AdminBookPackage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const prices = usePriceList();
  const [photos, setPhotos] = useState(String(pkg.includedPhotos));
  const [edits, setEdits] = useState(String(pkg.editsPerPhoto));
  const [price, setPrice] = useState(pkg.priceCents == null ? "" : (pkg.priceCents / 100).toFixed(2));
  const [active, setActive] = useState(pkg.active);
  const [order, setOrder] = useState(String(pkg.sortOrder));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [printCost, setPrintCost] = useState<number | null>(null);

  const photosN = Number.parseInt(photos, 10);
  const editsN = Number.parseInt(edits, 10);
  const orderN = Number.parseInt(order, 10);
  const priceCents = price.trim() === "" ? null : parseDollarsToCents(price);
  const priceValid = price.trim() === "" || (priceCents != null && priceCents > 0 && priceCents <= 100_000);
  const photosValid = Number.isInteger(photosN) && photosN >= 1 && photosN <= 200;
  const fit = photosValid ? packagePrintFit(pkg.bindingId, photosN) : null;
  const valid =
    photosValid && Number.isInteger(editsN) && editsN >= 0 && editsN <= 10 && Number.isInteger(orderN) && orderN >= 0 && priceValid && fit?.fits === true;
  const dirty =
    photosN !== pkg.includedPhotos ||
    editsN !== pkg.editsPerPhoto ||
    (price.trim() === "" ? null : priceCents) !== pkg.priceCents ||
    active !== pkg.active ||
    orderN !== pkg.sortOrder;

  // Our printing cost for this many photos, to compare with the price (Lulu's live quote).
  useEffect(() => {
    if (!fit) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void adminGetPrintCosts(fit.printedPages).then((res) => {
        if (cancelled || isError(res)) return;
        const sample = res.data.find((s) => s.sku === `book.print.${pkg.bindingId}`);
        setPrintCost(sample?.printCostCents ?? null);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [fit, pkg.bindingId]);

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    const res = await adminUpdateBookPackage(pkg.bindingId, {
      includedPhotos: photosN,
      editsPerPhoto: editsN,
      priceCents: price.trim() === "" ? null : priceCents,
      active,
      sortOrder: orderN,
    });
    setSaving(false);
    if (isError(res)) {
      setError(res.error.message);
      return;
    }
    setStatus("Saved");
    onSaved();
  }

  const pagePrice = sheetUsageCostCents(prices, "generation");
  const binding = BOOK_BINDINGS[pkg.bindingId];

  return (
    <Drawer
      onClose={onClose}
      title={`${binding.shortLabel} package`}
      subtitle="What customers get for one flat price. Shipping is added when they order the book."
      footer={
        <>
          {status ? (
            <p role="status" className="mr-auto text-sm font-semibold text-v2-success-text">
              {status}
            </p>
          ) : null}
          <button type="button" className="v2-btn-primary" disabled={!valid || !dirty || saving || !user} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save package
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <label className="block text-sm font-semibold text-v2-ink">
          Included photos
          <input
            className="v2-input mt-1 w-full text-right tabular-nums"
            inputMode="numeric"
            value={photos}
            onChange={(e) => {
              setStatus(null);
              setPhotos(e.target.value);
            }}
          />
        </label>
        {fit ? (
          <Callout tone={fit.fits ? "info" : "warning"} title={`Prints ${fit.printedPages} pages with blank backs (+ cover)`}>
            {binding.shortLabel} allows {fit.minPages} to {fit.maxPages} printed pages.
            {fit.fits ? "" : " This count doesn't fit, so the package can't be saved."}
          </Callout>
        ) : null}
        <label className="block text-sm font-semibold text-v2-ink">
          Touch-ups per photo
          <input
            className="v2-input mt-1 w-full text-right tabular-nums"
            inputMode="numeric"
            value={edits}
            onChange={(e) => {
              setStatus(null);
              setEdits(e.target.value);
            }}
          />
        </label>
        <div>
          <label htmlFor="package-price" className="block text-sm font-semibold text-v2-ink">
            Price
          </label>
          <MoneyInput
            id="package-price"
            className="mt-1"
            value={price}
            invalid={!priceValid}
            onChange={(v) => {
              setStatus(null);
              setPrice(v);
            }}
          />
          <p className="mt-1 text-xs text-v2-muted">Leave empty to hide this package from customers.</p>
          <p className="mt-1 text-xs text-v2-muted">
            {printCost != null ? `Printing this book costs us about ${money(printCost)} before shipping and tax. ` : ""}
            {pagePrice != null && photosValid
              ? `The same ${photosN} pages at the current page price would be ${formatCredits(pagePrice * photosN)}.`
              : ""}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
          <div>
            <p className="text-sm font-semibold text-v2-ink">Show to customers</p>
            <p className="text-xs text-v2-muted">Off hides it even with a price.</p>
          </div>
          <Switch checked={active} onChange={(v) => { setStatus(null); setActive(v); }} label="Show to customers" />
        </div>
        <label className="block text-sm font-semibold text-v2-ink">
          Order
          <input
            className="v2-input mt-1 w-full text-right tabular-nums"
            inputMode="numeric"
            value={order}
            onChange={(e) => {
              setStatus(null);
              setOrder(e.target.value);
            }}
          />
        </label>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
