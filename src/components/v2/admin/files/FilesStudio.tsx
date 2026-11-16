"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileX2, HardDrive } from "lucide-react";
import * as api from "@/lib/api/client";
import type {
  FileEvent,
  FileEventOutcome,
  FileEventSource,
  FileKind,
  FileKindStorage,
  FilePerson,
  FilesReport,
} from "@/lib/files/types";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { Drawer } from "@/components/v2/admin/Drawer";
import { CHART_COLORS, TrendChart } from "@/components/v2/admin/TrendChart";
import { count, fileSize, fullDateTime, percent, relativeTime, shortDate, shortId, usdCost, type Tone } from "@/components/v2/admin/format";
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
  SegmentedControl,
  StatusPill,
  Switch,
} from "@/components/v2/admin/ui";
import { useUrlParam } from "@/components/v2/admin/useUrlParam";

// --- Labels -------------------------------------------------------------------------------------

const KIND_LABEL: Record<FileKind, string> = {
  photo: "Photo",
  sheet: "Coloring page",
  thumbnail: "Preview image",
  cover: "Book cover",
  print_pdf: "Print file (PDF)",
  digital_pdf: "Print-at-home PDF",
  other: "Other file",
};

const KIND_PLURAL: Record<FileKind, string> = {
  photo: "Photos",
  sheet: "Coloring pages & edits",
  thumbnail: "Preview images",
  cover: "Book covers",
  print_pdf: "Print files (PDF)",
  digital_pdf: "Print-at-home PDFs",
  other: "Other files",
};

const KIND_NOTE: Partial<Record<FileKind, string>> = {
  sheet: "Every AI page and edit is kept, not just the one in use",
  thumbnail: "Small copies for album grids, made automatically",
  print_pdf: "Interior and cover sent to the printer",
};

const SOURCE_LABEL: Record<FileEventSource, string> = {
  browser: "Uploaded from a browser",
  generated: "Made by AI",
  edited: "AI edit",
  mirrored: "Flipped",
  copied: "Copied to another album",
  thumbnail: "Preview made",
  book_order: "Book order",
  migration: "Moved from a device",
  photo_delete: "Deleted a photo",
  album_delete: "Deleted an album",
  account_delete: "Account deleted",
  replaced: "Old version replaced",
  cleanup: "Cleanup after a failed step",
  backfill: "Stored before logging began",
  server: "Saved by the app",
};

const OUTCOME: Record<FileEventOutcome, { tone: Tone; label: string }> = {
  success: { tone: "good", label: "Done" },
  failed: { tone: "bad", label: "Failed" },
  abandoned: { tone: "warn", label: "Never finished" },
  pending: { tone: "progress", label: "In progress" },
};

function personLabel(p: FilePerson | null | undefined): string {
  if (!p) return "System";
  if (p.deleted) return `Deleted account ${shortId(p.id)}`;
  return p.name || p.email || shortId(p.id);
}

function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

const GB = 1e9;

/** Storage prices are fractions of a cent per GB: "$0.021". */
function rate(usd: number): string {
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

/** "Empty album", "Album, 3 photos", "2 photos". */
function deletedWhat(e: FileEvent): string | null {
  if (e.action !== "delete" || e.photoCount == null) return null;
  const photos = `${count(e.photoCount)} photo${e.photoCount === 1 ? "" : "s"}`;
  if (e.source === "album_delete") return e.photoCount ? `Album, ${photos}` : "Empty album";
  return photos;
}

function When({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={fullDateTime(iso)} className="whitespace-nowrap">
      {relativeTime(iso)}
    </time>
  );
}

function Person({ person }: { person: FilePerson | null | undefined }) {
  if (!person || person.deleted) return <span className="text-v2-muted">{personLabel(person)}</span>;
  return (
    <Link
      href={`/admin/users?user=${person.id}`}
      className="block truncate text-v2-link hover:underline"
      title={person.email ?? undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {personLabel(person)}
    </Link>
  );
}

// --- Page ---------------------------------------------------------------------------------------

type Period = "30" | "90" | "all";
type LogFilter = "all" | "upload" | "delete" | "problems";

const PERIOD_LABEL: Record<Period, string> = { "30": "last 30 days", "90": "last 90 days", all: "all time" };

export function FilesStudio() {
  const [period, setPeriod] = useState<Period>("30");
  const [thumbs, setThumbs] = useState(false);
  const [tick, setTick] = useState(0);
  const [report, setReport] = useState<FilesReport | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useUrlParam("event");

  useEffect(() => {
    let alive = true;
    void api.adminFilesReport({ days: period === "all" ? "all" : Number(period), thumbnails: thumbs }).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (api.isError(r)) setError(r.error);
      else {
        setError(null);
        setReport(r.data);
      }
    });
    return () => {
      alive = false;
    };
  }, [period, thumbs, tick]);

  const reload = (change?: () => void) => {
    setLoading(true);
    change?.();
    setTick((t) => t + 1);
  };

  const people = report?.people;
  const events = useMemo(() => {
    const list = report?.events ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((e) => {
      if (filter === "upload" && e.action !== "upload") return false;
      if (filter === "delete" && e.action !== "delete") return false;
      if (filter === "problems" && (e.outcome === "success" || e.outcome === "pending")) return false;
      if (!q) return true;
      const who = [e.actorId, e.ownerId].map((id) => (id ? people?.[id] : null));
      return [
        KIND_LABEL[e.kind],
        SOURCE_LABEL[e.source],
        e.path,
        e.error,
        ...who.flatMap((p) => [p?.email, p?.name]),
      ].some((v) => v?.toLowerCase().includes(q));
    });
  }, [report, filter, query, people]);

  const header = (
    <PageHeader
      title="Files & storage"
      description="Every photo, coloring page and book file we keep: how much space it takes, what it costs, and who uploaded or deleted what."
      actions={
        <>
          <SegmentedControl
            ariaLabel="Period"
            value={period}
            onChange={(p) => reload(() => setPeriod(p))}
            options={[
              { id: "30", label: "30 days" },
              { id: "90", label: "90 days" },
              { id: "all", label: "All time" },
            ]}
          />
          <RefreshButton onClick={() => reload()} loading={loading} />
        </>
      }
    />
  );

  if (!report) {
    return (
      <>
        {header}
        {error ? (
          error.code === "MIGRATION_PENDING" ? (
            <Callout tone="warning" title="The file log isn't set up yet">
              Database migration 0035 (file_events) needs to be applied before this page can show storage and the upload log.
            </Callout>
          ) : (
            <ErrorPanel>Couldn&apos;t load files: {error.message}</ErrorPanel>
          )
        ) : (
          <PageLoading label="Loading files" />
        )}
      </>
    );
  }

  const { storage, totals, daily } = report;
  const periodText = PERIOD_LABEL[period];
  const usedGb = storage.bytes / GB;
  const planShare = storage.includedGb > 0 ? (usedGb / storage.includedGb) * 100 : null;
  const billableGb = Math.max(0, usedGb - storage.includedGb);
  const monthlyBill = billableGb * storage.usdPerGbMonth;
  const monthlyList = usedGb * storage.usdPerGbMonth;
  const perDayBytes = storage.added30dBytes / 30;
  const roomBytes = storage.includedGb * GB - storage.bytes;
  const daysToFull = perDayBytes > 0 && roomBytes > 0 ? Math.round(roomBytes / perDayBytes) : null;
  const inYearGb = (storage.bytes + perDayBytes * 365) / GB;

  const attempted = totals.uploadsSucceeded + totals.uploadsFailed + totals.uploadsAbandoned;
  const successRate = attempted ? (totals.uploadsSucceeded / attempted) * 100 : null;
  const problems = totals.uploadsFailed + totals.uploadsAbandoned;
  const deleteRate = totals.photosUploaded ? (totals.photosDeleted / totals.photosUploaded) * 100 : null;
  const kindCount = (k: FileKind) => storage.byKind.find((b) => b.kind === k)?.objects ?? 0;

  const kindColumns: Column<FileKindStorage>[] = [
    {
      key: "kind",
      header: "Type",
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-v2-ink">{KIND_PLURAL[r.kind]}</span>
          {KIND_NOTE[r.kind] ? <span className="block text-xs text-v2-muted">{KIND_NOTE[r.kind]}</span> : null}
        </span>
      ),
      sortValue: (r) => KIND_PLURAL[r.kind],
    },
    { key: "files", header: "Files", align: "right", cell: (r) => count(r.objects), sortValue: (r) => r.objects },
    { key: "size", header: "Space", align: "right", cell: (r) => fileSize(r.bytes), sortValue: (r) => r.bytes },
    {
      key: "share",
      header: "Share",
      align: "right",
      hideBelow: "md",
      cell: (r) => percent(storage.bytes ? (r.bytes / storage.bytes) * 100 : 0, 0),
      sortValue: (r) => r.bytes,
    },
    {
      key: "avg",
      header: "Avg file",
      align: "right",
      hideBelow: "lg",
      cell: (r) => fileSize(r.objects ? Math.round(r.bytes / r.objects) : null),
      sortValue: (r) => (r.objects ? r.bytes / r.objects : 0),
    },
    {
      key: "added",
      header: "Added, 30 days",
      align: "right",
      hideBelow: "lg",
      cell: (r) => (r.added30dObjects ? `${fileSize(r.added30dBytes)} · ${count(r.added30dObjects)}` : "—"),
      sortValue: (r) => r.added30dBytes,
    },
    {
      key: "cost",
      header: "Per month",
      align: "right",
      hideBelow: "md",
      cell: (r) => usdCost((r.bytes / GB) * storage.usdPerGbMonth),
      sortValue: (r) => r.bytes,
    },
    {
      key: "unused",
      header: "Unused",
      align: "right",
      hideBelow: "xl",
      cell: (r) => (r.orphanedObjects ? <span className="text-amber-700">{fileSize(r.orphanedBytes)}</span> : "—"),
      sortValue: (r) => r.orphanedBytes,
    },
  ];

  const logColumns: Column<FileEvent>[] = [
    { key: "when", header: "When", cell: (e) => <When iso={e.at} />, sortValue: (e) => e.at },
    {
      key: "action",
      header: "Action",
      cell: (e) => <StatusPill tone={e.action === "delete" ? "warn" : "info"}>{e.action === "delete" ? "Delete" : "Upload"}</StatusPill>,
      sortValue: (e) => e.action,
    },
    {
      key: "what",
      header: "What",
      cell: (e) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-v2-ink">
            {deletedWhat(e) ?? KIND_LABEL[e.kind]}
          </span>
          <span className="block text-xs text-v2-muted">{SOURCE_LABEL[e.source] ?? e.source}</span>
        </span>
      ),
      sortValue: (e) => KIND_LABEL[e.kind],
    },
    {
      key: "who",
      header: "Who",
      width: "max-w-[14rem]",
      cell: (e) => <Person person={e.actorId ? people?.[e.actorId] : e.ownerId && e.source !== "thumbnail" ? people?.[e.ownerId] : null} />,
      sortValue: (e) => personLabel(e.actorId ? people?.[e.actorId] : null),
    },
    {
      key: "files",
      header: "Files",
      align: "right",
      hideBelow: "lg",
      cell: (e) => (e.fileCount == null ? "—" : count(e.fileCount)),
      sortValue: (e) => e.fileCount,
    },
    { key: "size", header: "Size", align: "right", cell: (e) => fileSize(e.bytes), sortValue: (e) => e.bytes },
    { key: "took", header: "Took", align: "right", hideBelow: "xl", cell: (e) => duration(e.durationMs), sortValue: (e) => e.durationMs },
    {
      key: "result",
      header: "Result",
      cell: (e) => <StatusPill tone={OUTCOME[e.outcome].tone}>{OUTCOME[e.outcome].label}</StatusPill>,
      sortValue: (e) => e.outcome,
    },
  ];

  const selected = openId ? (report.events.find((e) => e.id === openId) ?? null) : null;

  return (
    <div className="space-y-8">
      {header}

      {error ? <ErrorPanel>Couldn&apos;t refresh: {error.message}</ErrorPanel> : null}

      {planShare != null && planShare >= 80 ? (
        <Callout
          tone={planShare >= 100 ? "critical" : "warning"}
          title={
            planShare >= 100
              ? `Storage is over the ${storage.includedGb} GB your plan includes`
              : `Storage is at ${percent(planShare, 0)} of the ${storage.includedGb} GB your plan includes`
          }
        >
          {fileSize(storage.bytes)} stored.{" "}
          {daysToFull != null
            ? `At the last 30 days' pace (${fileSize(perDayBytes)} a day) it fills in about ${count(daysToFull)} day${daysToFull === 1 ? "" : "s"}. `
            : null}
          On Supabase Free, uploads can stop when the allowance runs out; on a paid plan the extra is billed at{" "}
          {rate(storage.usdPerGbMonth)} per GB-month. Set your plan&apos;s allowance in{" "}
          <Link href="/admin/finance" className="font-semibold underline">
            Financials → Assumptions
          </Link>
          .
        </Callout>
      ) : null}

      {storage.orphanedObjects || storage.noAccountObjects ? (
        <Callout tone="warning" title={`${fileSize(storage.orphanedBytes + storage.noAccountBytes)} is stored but no longer used`}>
          {storage.orphanedObjects ? `${count(storage.orphanedObjects)} file${storage.orphanedObjects === 1 ? "" : "s"} nothing points to any more (left after a failed or interrupted step). ` : null}
          {storage.noAccountObjects ? `${count(storage.noAccountObjects)} file${storage.noAccountObjects === 1 ? "" : "s"} in folders of accounts that no longer exist. ` : null}
          They still count toward storage. See the Unused column below.
        </Callout>
      ) : null}

      {problems ? (
        <Callout tone="warning" title={`${count(problems)} upload${problems === 1 ? "" : "s"} didn't finish in the ${periodText}`}>
          {totals.uploadsFailed ? `${count(totals.uploadsFailed)} failed. ` : null}
          {totals.uploadsAbandoned ? `${count(totals.uploadsAbandoned)} started but the file never arrived (the browser closed or lost its connection). ` : null}
          <button type="button" className="font-semibold underline" onClick={() => setFilter("problems")}>
            Show them in the log
          </button>
          .
        </Callout>
      ) : null}

      <Section title="Storage now" description="Read straight from the storage bucket, so it includes every file, however old.">
        <KpiGrid>
          <KpiTile
            label="Space used"
            value={fileSize(storage.bytes)}
            tone={planShare != null && planShare >= 100 ? "bad" : "default"}
            sub={planShare != null ? `${percent(planShare, 0)} of the ${storage.includedGb} GB your plan includes` : "No plan allowance set"}
          />
          <KpiTile
            label="Files stored"
            value={count(storage.objects)}
            sub={`${count(kindCount("photo"))} photos · ${count(kindCount("sheet"))} pages · ${count(kindCount("thumbnail"))} previews`}
          />
          <KpiTile
            label="Storage cost per month"
            value={usdCost(monthlyBill)}
            sub={
              billableGb > 0
                ? `${billableGb.toFixed(2)} GB over the allowance at ${rate(storage.usdPerGbMonth)}/GB · ${usdCost(storage.lifetimeUsd)} lifetime at list rate`
                : `Within the allowance · ${usdCost(monthlyList)}/month and ${usdCost(storage.lifetimeUsd)} lifetime at list rate`
            }
          />
          <KpiTile
            label="Growth, last 30 days"
            value={`+${fileSize(storage.added30dBytes)}`}
            trend={daily.some((d) => d.uploadBytes || d.deleteBytes) ? daily.map((d) => d.uploadBytes - d.deleteBytes) : undefined}
            sub={
              daysToFull != null
                ? `Allowance full in ~${count(daysToFull)} days at this pace`
                : `~${inYearGb.toFixed(1)} GB a year from now at this pace`
            }
          />
        </KpiGrid>
      </Section>

      <Section title={`Uploads and deletes, ${periodText}`} description="From the file log. Files stored before logging began count as uploads on the day they were saved.">
        <div className="space-y-4">
          <KpiGrid>
            <KpiTile
              label="Photos uploaded"
              value={count(totals.photosUploaded)}
              sub={totals.photosUploaded ? `${fileSize(totals.photosUploadedBytes)} · avg ${fileSize(Math.round(totals.photosUploadedBytes / totals.photosUploaded))}` : "None"}
            />
            <KpiTile
              label="Coloring pages saved"
              value={count(totals.sheetsSaved)}
              sub={totals.sheetsSaved ? `${fileSize(totals.sheetsSavedBytes)} · avg ${fileSize(Math.round(totals.sheetsSavedBytes / totals.sheetsSaved))}` : "None"}
            />
            <KpiTile
              label="Book files made"
              value={count(totals.bookFiles)}
              sub={totals.bookFiles ? `${fileSize(totals.bookFilesBytes)} of covers and PDFs` : "None"}
            />
            <KpiTile
              label="Photos deleted"
              value={count(totals.photosDeleted)}
              sub={`${count(totals.deleteEvents)} delete${totals.deleteEvents === 1 ? "" : "s"}${totals.bytesFreed ? ` · ${fileSize(totals.bytesFreed)} freed` : ""}`}
            />
          </KpiGrid>
          <KpiGrid>
            <KpiTile
              label="Deleted vs uploaded"
              value={percent(deleteRate, 0)}
              sub="Photos deleted for every 100 uploaded"
            />
            <KpiTile
              label="Upload success"
              value={percent(successRate, successRate != null && successRate < 100 ? 1 : 0)}
              tone={successRate != null && successRate < 95 ? "bad" : "default"}
              sub={attempted ? `${count(totals.uploadsSucceeded)} of ${count(attempted)} finished` : "No uploads"}
            />
            <KpiTile
              label="Photo upload time"
              value={duration(totals.browserUploadAvgMs)}
              sub={totals.browserUploadP95Ms != null ? `Average; slowest 5% over ${duration(totals.browserUploadP95Ms)}` : "From the browser, once timed"}
            />
            <KpiTile
              label="Saving an AI page"
              value={duration(totals.serverWriteAvgMs)}
              sub="Average time to write a new page to storage"
            />
          </KpiGrid>
        </div>
      </Section>

      <Section title="Space added and freed" description="The last 30 days, in UTC days.">
        <div className="v2-panel p-5">
          {daily.some((d) => d.uploadBytes || d.deleteBytes) ? (
            <TrendChart
              ariaLabel="Storage added and freed per day over the last 30 days"
              labels={daily.map((d) => shortDate(`${d.date}T12:00:00Z`))}
              series={[
                { label: "Added", values: daily.map((d) => d.uploadBytes), color: CHART_COLORS.primary, kind: "bar" },
                { label: "Freed", values: daily.map((d) => d.deleteBytes), color: CHART_COLORS.cost, kind: "barDown" },
              ]}
              format={(v) => fileSize(Math.abs(v))}
            />
          ) : (
            <EmptyState icon={HardDrive} title="No files added or removed in the last 30 days" />
          )}
        </div>
      </Section>

      <Section title="What's stored" description={`Per month is the list rate of ${rate(storage.usdPerGbMonth)} per GB-month, before your plan's allowance.`}>
        <DataTable
          caption="Stored files by type"
          columns={kindColumns}
          rows={storage.byKind}
          rowKey={(r) => r.kind}
          defaultSort={{ key: "size", dir: "desc" }}
          empty={<EmptyState icon={HardDrive} title="Nothing stored yet" />}
        />
      </Section>

      <div className="grid gap-8 xl:grid-cols-2">
        <Section title="Who stores the most" description="Space in each account's folder, including its book files.">
          <div className="v2-panel divide-y divide-gray-100">
            {report.topOwners.length ? (
              report.topOwners.map((o) => {
                const share = storage.bytes ? (o.bytes / storage.bytes) * 100 : 0;
                return (
                  <div key={o.person.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <Person person={o.person} />
                      <span className="block text-xs text-v2-muted">{count(o.objects)} files</span>
                    </span>
                    <span className="hidden h-2 w-28 overflow-hidden rounded-full bg-v2-bg-subtle sm:block" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${share}%`, background: CHART_COLORS.primary }} />
                    </span>
                    <span className="w-24 text-right">
                      <span className="block font-semibold tabular-nums text-v2-ink">{fileSize(o.bytes)}</span>
                      <span className="block text-xs tabular-nums text-v2-muted">{percent(share, 0)}</span>
                    </span>
                  </div>
                );
              })
            ) : (
              <EmptyState title="No account has files yet" />
            )}
          </div>
        </Section>

        <Section title="Largest files">
          <div className="v2-panel divide-y divide-gray-100">
            {report.largest.length ? (
              report.largest.map((f) => (
                <div key={f.path} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-v2-ink">{KIND_LABEL[f.kind]}</span>
                    <span className="block truncate text-xs text-v2-muted">
                      {personLabel(f.owner)} · {shortDate(f.at)}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-v2-ink">{fileSize(f.bytes)}</span>
                </div>
              ))
            ) : (
              <EmptyState title="Nothing stored yet" />
            )}
          </div>
        </Section>
      </div>

      {totals.deletesBySource.length ? (
        <Section title={`Why files were deleted, ${periodText}`}>
          <div className="v2-panel divide-y divide-gray-100">
            {totals.deletesBySource.map((d) => (
              <div key={d.source} className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 font-semibold text-v2-ink">{SOURCE_LABEL[d.source] ?? d.source}</span>
                <span className="w-24 text-right tabular-nums text-v2-muted">
                  {count(d.events)} time{d.events === 1 ? "" : "s"}
                </span>
                <span className="hidden w-24 text-right tabular-nums text-v2-muted sm:inline">
                  {d.photos ? `${count(d.photos)} photo${d.photos === 1 ? "" : "s"}` : "—"}
                </span>
                <span className="w-20 text-right font-semibold tabular-nums text-v2-ink">{d.bytes ? fileSize(d.bytes) : "—"}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        id="log"
        title="Audit log"
        description={`Every upload and delete in the ${periodText}, newest first (up to 1,000). Click a row for the details.`}
        action={
          <div className="flex items-center gap-2 text-sm font-semibold text-v2-navy">
            <Switch checked={thumbs} onChange={(v) => reload(() => setThumbs(v))} label="Include preview images" />
            <span aria-hidden>Include preview images</span>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SegmentedControl
            ariaLabel="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All" },
              { id: "upload", label: "Uploads" },
              { id: "delete", label: "Deletes" },
              { id: "problems", label: "Problems" },
            ]}
          />
          <SearchInput value={query} onChange={setQuery} placeholder="Person, type or path…" label="Search the log" />
        </div>
        <DataTable
          caption="File uploads and deletes"
          columns={logColumns}
          rows={events}
          rowKey={(e) => e.id}
          loading={loading}
          defaultSort={{ key: "when", dir: "desc" }}
          selectedKey={openId}
          onRowClick={(e) => setOpenId(e.id)}
          rowLabel={(e) => `Open ${e.action} of ${KIND_LABEL[e.kind]}`}
          empty={
            <EmptyState icon={FileX2} title={filter === "problems" ? "No failed or unfinished uploads." : "Nothing in the log for this view."}>
              {query ? "Try a different search." : null}
            </EmptyState>
          }
          mobileCard={(e) => (
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-v2-ink">
                  {e.action === "delete" ? "Deleted" : "Uploaded"} {KIND_LABEL[e.kind].toLowerCase()}
                </span>
                <span className="mt-0.5 block truncate text-xs text-v2-muted">
                  {personLabel(e.actorId ? people?.[e.actorId] : null)} · {relativeTime(e.at)}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm">
                <StatusPill tone={OUTCOME[e.outcome].tone}>{OUTCOME[e.outcome].label}</StatusPill>
                <span className="mt-0.5 block text-xs text-v2-muted">{fileSize(e.bytes)}</span>
              </span>
            </span>
          )}
        />
      </Section>

      {selected ? <EventDrawer key={selected.id} event={selected} people={report.people} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

// --- One event ----------------------------------------------------------------------------------

function EventDrawer({ event, people, onClose }: { event: FileEvent; people: Record<string, FilePerson>; onClose: () => void }) {
  const actor = event.actorId ? people[event.actorId] : null;
  const owner = event.ownerId ? people[event.ownerId] : null;
  return (
    <Drawer
      onClose={onClose}
      title={`${event.action === "delete" ? "Delete" : "Upload"}: ${KIND_LABEL[event.kind]}`}
      subtitle={fullDateTime(event.at)}
    >
      <div className="space-y-6">
        {event.error ? (
          <Callout tone="critical" title="What went wrong">
            {event.error}
          </Callout>
        ) : null}
        <DefinitionList
          items={[
            { label: "Result", value: <StatusPill tone={OUTCOME[event.outcome].tone}>{OUTCOME[event.outcome].label}</StatusPill> },
            { label: "How", value: SOURCE_LABEL[event.source] ?? event.source },
            { label: "Done by", value: actor ? <Person person={actor} /> : event.source === "thumbnail" ? "System" : "Unknown" },
            {
              label: "Whose files",
              value: owner ? <Person person={owner} /> : "—",
              note: "The album or account owner; differs when a contributor uploads",
            },
            ...(event.photoCount != null ? [{ label: "Photos", value: count(event.photoCount) }] : []),
            { label: "Files", value: event.fileCount == null ? "Unknown" : count(event.fileCount) },
            { label: "Size", value: fileSize(event.bytes) },
            {
              label: "Took",
              value: duration(event.durationMs),
              note:
                event.source === "browser" || event.source === "migration"
                  ? "From the upload link being issued to the file being registered, including the customer's connection"
                  : "Time spent writing to or removing from storage",
            },
            {
              label: event.action === "delete" && (event.fileCount ?? 0) > 1 ? "Folder" : "Path",
              value: event.path ? <code className="break-all text-xs font-normal">{event.path}</code> : "—",
            },
            { label: "Log entry", value: <code className="text-xs font-normal">{event.id}</code> },
          ]}
        />
      </div>
    </Drawer>
  );
}
