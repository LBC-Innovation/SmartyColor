"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe, Loader2, UserRound } from "lucide-react";
import * as api from "@/lib/api/client";
import type { GuestCall, GuestCostsReport, GuestIpRow } from "@/lib/guests/types";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { Drawer } from "@/components/v2/admin/Drawer";
import { CHART_COLORS, TrendChart } from "@/components/v2/admin/TrendChart";
import { aiActionLabel, count, fullDateTime, percent, relativeTime, shortDate, usd4, usdCost } from "@/components/v2/admin/format";
import {
  Callout,
  DefinitionList,
  EmptyState,
  ErrorPanel,
  KpiGrid,
  KpiTile,
  PageHeader,
  PageLoading,
  RefreshButton,
  SearchInput,
  Section,
} from "@/components/v2/admin/ui";
import { useUrlParam } from "@/components/v2/admin/useUrlParam";

// --- Location formatting ------------------------------------------------------------------------

let countryNames: Intl.DisplayNames | null = null;
function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    countryNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return countryNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** 🇺🇸 from "US"; empty for anything that isn't two letters. */
function flag(code: string | null): string {
  if (!code || !/^[a-z]{2}$/i.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** "San Jose, CA, United States": most specific first. */
function placeLabel(row: { city: string | null; region: string | null; country: string | null }): string | null {
  const parts = [row.city, row.region, countryName(row.country)].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** IPv6 addresses are grouped by their /64, stored as "v6/2001:db8:1:2". */
function ipLabel(ip: string): string {
  return ip.startsWith("v6/") ? `${ip.slice(3)}::/64` : ip;
}

function Place({ row }: { row: { city: string | null; region: string | null; country: string | null } }) {
  const label = placeLabel(row);
  if (!label) return <span className="text-v2-muted">Unknown</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {row.country ? (
        <span aria-hidden className="shrink-0">
          {flag(row.country)}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

function When({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={fullDateTime(iso)} className="whitespace-nowrap">
      {relativeTime(iso)}
    </time>
  );
}

// --- Page ---------------------------------------------------------------------------------------

export function GuestsStudio() {
  const [report, setReport] = useState<GuestCostsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openIp, setOpenIp] = useUrlParam("ip");

  const load = useCallback(async () => {
    const r = await api.adminGuestCosts();
    setLoading(false);
    if (api.isError(r)) setError(r.error.message);
    else {
      setError(null);
      setReport(r.data);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void api.adminGuestCosts().then((r) => {
      if (!alive) return;
      setLoading(false);
      if (api.isError(r)) setError(r.error.message);
      else setReport(r.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    const list = report?.byIp ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.ip, ipLabel(r.ip), r.city, r.region, r.country, countryName(r.country), r.postal].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [report, query]);

  const selected = openIp ? (report?.byIp.find((r) => r.ip === openIp) ?? null) : null;

  const header = (
    <PageHeader
      title="Guests"
      description="What people without an account cost in AI, by address and rough location. Guests keep their photos in their own browser, so they cost no storage."
      actions={
        <>
          {report?.byIp.length ? <SearchInput value={query} onChange={setQuery} placeholder="Address or place…" label="Search guests" /> : null}
          <RefreshButton
            onClick={() => {
              setLoading(true);
              void load();
            }}
            loading={loading}
          />
        </>
      }
    />
  );

  if (!report) {
    return (
      <>
        {header}
        {error ? <ErrorPanel>Couldn&apos;t load guests: {error}</ErrorPanel> : <PageLoading label="Loading guests" />}
      </>
    );
  }

  const { allTime, last30d, daily, byCountry, unattributed } = report;
  const tracked = allTime.costUsd - (unattributed?.costUsd ?? 0);
  const perIp = allTime.ips ? tracked / allTime.ips : null;
  const countryTotal = byCountry.reduce((s, c) => s + c.costUsd, 0);

  const columns: Column<GuestIpRow>[] = [
    {
      key: "ip",
      header: "Address",
      cell: (r) => <span className="font-mono text-xs text-v2-ink">{ipLabel(r.ip)}</span>,
      sortValue: (r) => r.ip,
    },
    { key: "place", header: "Location", cell: (r) => <Place row={r} />, sortValue: (r) => placeLabel(r) ?? "" },
    { key: "calls", header: "AI calls", align: "right", cell: (r) => count(r.calls), sortValue: (r) => r.calls },
    { key: "cost", header: "Cost", align: "right", cell: (r) => usdCost(r.costUsd), sortValue: (r) => r.costUsd },
    { key: "first", header: "First seen", hideBelow: "xl", cell: (r) => shortDate(r.firstAt), sortValue: (r) => r.firstAt },
    { key: "last", header: "Last seen", hideBelow: "md", cell: (r) => <When iso={r.lastAt} />, sortValue: (r) => r.lastAt },
  ];

  return (
    <div className="space-y-8">
      {header}

      {error ? <ErrorPanel>Couldn&apos;t refresh: {error}</ErrorPanel> : null}

      {!report.tracking ? (
        <Callout tone="warning" title="Guest addresses aren't being recorded yet">
          The database update that stores each guest&apos;s address and location hasn&apos;t been applied. Until it is, guest
          costs show only as a total.
        </Callout>
      ) : null}

      <KpiGrid>
        <KpiTile label="Guest AI cost, all time" value={usdCost(allTime.costUsd)} sub={`${count(allTime.calls)} AI calls`} />
        <KpiTile
          label="Last 30 days"
          value={usdCost(last30d.costUsd)}
          sub={`${count(last30d.calls)} calls from ${count(last30d.ips)} address${last30d.ips === 1 ? "" : "es"}`}
          trend={daily.some((d) => d.calls) ? daily.map((d) => d.costUsd) : undefined}
        />
        <KpiTile label="Addresses" value={count(allTime.ips)} sub={byCountry.length ? `In ${count(byCountry.filter((c) => c.country).length)} countries` : "None recorded yet"} />
        <KpiTile label="Avg per address" value={usdCost(perIp)} sub="Recorded addresses only" />
      </KpiGrid>

      {unattributed ? (
        <Callout tone="info" title={`${usdCost(unattributed.costUsd)} from ${count(unattributed.calls)} calls has no address`}>
          These are guest calls from before addresses were recorded ({shortDate(unattributed.firstAt)} to{" "}
          {shortDate(unattributed.lastAt)}), plus calls by accounts that were since deleted. They count in the totals above but
          can&apos;t be traced to a place.
        </Callout>
      ) : null}

      <Section title="Daily guest spend" description="The last 30 days, in UTC days.">
        <div className="v2-panel p-5">
          {daily.some((d) => d.calls) ? (
            <TrendChart
              ariaLabel="Daily guest AI spend over the last 30 days"
              labels={daily.map((d) => shortDate(`${d.date}T12:00:00Z`))}
              series={[{ label: "Spend", values: daily.map((d) => d.costUsd), color: CHART_COLORS.primary, kind: "bar" }]}
              format={usd4}
              axisFormat={(v) => `$${v.toFixed(v >= 1 || v === 0 ? 0 : 2)}`}
            />
          ) : (
            <EmptyState icon={UserRound} title="No guest AI calls in the last 30 days" />
          )}
        </div>
      </Section>

      {byCountry.length ? (
        <Section title="By country" description="All time, recorded addresses only.">
          <div className="v2-panel divide-y divide-gray-100">
            {byCountry.map((c) => {
              const share = countryTotal > 0 ? (c.costUsd / countryTotal) * 100 : 0;
              return (
                <div key={c.country ?? "unknown"} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-v2-ink">
                    <span aria-hidden>{flag(c.country)}</span>
                    <span className="truncate">{countryName(c.country) ?? "Unknown location"}</span>
                  </span>
                  <span className="hidden h-2 w-40 overflow-hidden rounded-full bg-v2-bg-subtle sm:block" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${share}%`, background: CHART_COLORS.primary }} />
                  </span>
                  <span className="hidden w-28 text-right text-xs tabular-nums text-v2-muted sm:inline">
                    {count(c.ips)} address{c.ips === 1 ? "" : "es"} · {percent(share, 0)}
                  </span>
                  <span className="w-20 text-right font-semibold tabular-nums text-v2-ink">{usdCost(c.costUsd)}</span>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section
        title="By address"
        description="Click an address for its calls and location. IPv6 visitors are grouped by their /64 network, the same way guest limits count them."
      >
        <DataTable
          caption="Guest addresses and what their AI calls cost"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.ip}
          loading={loading && !report}
          defaultSort={{ key: "cost", dir: "desc" }}
          selectedKey={openIp}
          onRowClick={(r) => setOpenIp(r.ip)}
          rowLabel={(r) => `Open ${ipLabel(r.ip)}`}
          empty={
            <EmptyState icon={Globe} title={query ? "No address matches that search." : "No guest addresses recorded yet."}>
              {query ? "Try part of the address, a city or a country." : "New guest pages will appear here with where they came from."}
            </EmptyState>
          }
          mobileCard={(r) => (
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs font-semibold text-v2-ink">{ipLabel(r.ip)}</span>
                <span className="mt-0.5 block text-sm text-v2-navy">
                  <Place row={r} />
                </span>
              </span>
              <span className="shrink-0 text-right text-sm">
                <span className="block font-semibold tabular-nums text-v2-ink">{usdCost(r.costUsd)}</span>
                <span className="block text-xs text-v2-muted">{count(r.calls)} calls</span>
              </span>
            </span>
          )}
        />
      </Section>

      {selected ? <GuestDrawer key={selected.ip} guest={selected} onClose={() => setOpenIp(null)} /> : null}
    </div>
  );
}

// --- One address --------------------------------------------------------------------------------

function GuestDrawer({ guest, onClose }: { guest: GuestIpRow; onClose: () => void }) {
  const [calls, setCalls] = useState<GuestCall[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api.adminGuestCalls(guest.ip).then((r) => {
      if (!alive) return;
      if (api.isError(r)) setError(r.error.message);
      else setCalls(r.data);
    });
    return () => {
      alive = false;
    };
  }, [guest.ip]);

  const hasPoint = guest.latitude != null && guest.longitude != null;
  const mapUrl = hasPoint
    ? `https://www.openstreetmap.org/?mlat=${guest.latitude}&mlon=${guest.longitude}#map=11/${guest.latitude}/${guest.longitude}`
    : null;
  // Several places for one address means it moved (mobile network, VPN): show them all.
  const places = useMemo(() => {
    const seen = new Map<string, number>();
    for (const c of calls ?? []) {
      const label = placeLabel(c);
      if (label) seen.set(label, (seen.get(label) ?? 0) + 1);
    }
    return [...seen.entries()];
  }, [calls]);

  const callColumns: Column<GuestCall>[] = [
    { key: "when", header: "When", cell: (r) => <When iso={r.at} />, sortValue: (r) => r.at },
    { key: "action", header: "Action", cell: (r) => aiActionLabel(r.operation), sortValue: (r) => aiActionLabel(r.operation) },
    { key: "place", header: "Location", hideBelow: "md", cell: (r) => <Place row={r} /> },
    { key: "cost", header: "Cost", align: "right", cell: (r) => usd4(r.costUsd), sortValue: (r) => r.costUsd },
  ];

  return (
    <Drawer
      onClose={onClose}
      width="lg"
      title={<span className="font-mono">{ipLabel(guest.ip)}</span>}
      subtitle={placeLabel(guest) ?? "Location unknown"}
    >
      <div className="space-y-6">
        <DefinitionList
          items={[
            { label: "AI cost", value: usdCost(guest.costUsd), note: `${count(guest.calls)} call${guest.calls === 1 ? "" : "s"}` },
            { label: "First seen", value: <span title={fullDateTime(guest.firstAt)}>{shortDate(guest.firstAt)}</span> },
            { label: "Last seen", value: <span title={fullDateTime(guest.lastAt)}>{relativeTime(guest.lastAt)}</span> },
            { label: "Country", value: guest.country ? `${flag(guest.country)} ${countryName(guest.country)}` : "Unknown" },
            { label: "State / region", value: guest.region ?? "Unknown" },
            { label: "City", value: guest.city ?? "Unknown" },
            { label: "Postal code", value: guest.postal ?? "Unknown" },
            {
              label: "Approximate point",
              note: "From the address, usually right to the city, not the street",
              value: mapUrl ? (
                <a href={mapUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-v2-link hover:underline">
                  {guest.latitude?.toFixed(3)}, {guest.longitude?.toFixed(3)}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">(opens a map in a new tab)</span>
                </a>
              ) : (
                "Unknown"
              ),
            },
          ]}
        />

        {places.length > 1 ? (
          <Callout tone="info" title="Seen in more than one place">
            {places.map(([label, n]) => `${label} (${n})`).join("; ")}. Mobile networks and VPNs can move an address around.
          </Callout>
        ) : null}

        <section aria-labelledby="guest-calls">
          <h3 id="guest-calls" className="mb-2 text-sm font-semibold text-v2-ink">
            AI calls
          </h3>
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              Couldn&apos;t load calls: {error}
            </p>
          ) : calls == null ? (
            <p className="flex items-center gap-2 text-sm text-v2-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading calls…
            </p>
          ) : (
            <DataTable
              caption={`AI calls from ${ipLabel(guest.ip)}`}
              columns={callColumns}
              rows={calls}
              rowKey={(r) => r.id}
              defaultSort={{ key: "when", dir: "desc" }}
              empty={<EmptyState title="No calls found" />}
            />
          )}
        </section>
      </div>
    </Drawer>
  );
}
