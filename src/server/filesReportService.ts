import "server-only";
import type { ApiResult } from "@/lib/api/types";
import { DEFAULT_STORAGE_INCLUDED_GB, DEFAULT_STORAGE_USD_PER_GB_MONTH } from "@/lib/finance/types";
import type {
  FileEvent,
  FileEventOutcome,
  FileEventSource,
  FileEventTotals,
  FileKind,
  FileKindStorage,
  FilePerson,
  FilesReport,
} from "@/lib/files/types";
import { getSupabaseAdmin, getSupabaseAuth } from "@/lib/supabase/service";

/**
 * The admin Files page: what's stored now (read from storage itself), and the upload/delete log
 * (file_events, migration 0035).
 */

const DAY_MS = 86_400_000;
const LOG_LIMIT = 1000;

type TotalsRow = {
  action: "upload" | "delete";
  kind: FileKind;
  source: FileEventSource;
  outcome: FileEventOutcome;
  events: number | string;
  files: number | string;
  photos: number | string;
  bytes: number | string;
  avg_ms: number | string | null;
  p95_ms: number | string | null;
};

type SummaryRow = {
  kind: FileKind;
  state: "in_use" | "orphaned" | "no_account";
  objects: number | string;
  bytes: number | string;
  gb_months: number | string;
  oldest: string | null;
  added_30d_bytes: number | string;
  added_30d_objects: number | string;
};

type EventRow = {
  id: string;
  occurred_at: string;
  action: "upload" | "delete";
  kind: FileKind;
  source: FileEventSource;
  outcome: FileEventOutcome;
  owner_id: string | null;
  actor_id: string | null;
  file_count: number | null;
  photo_count: number | null;
  bytes: number | string | null;
  storage_path: string | null;
  duration_ms: number | null;
  error: string | null;
};

const n = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));
const nOrNull = (v: number | string | null | undefined) => (v == null ? null : Number(v));

const PHOTO_UPLOAD_SOURCES: FileEventSource[] = ["browser", "backfill"];
const SHEET_SOURCES: FileEventSource[] = ["generated", "edited", "migration", "backfill", "server"];
const KIND_ORDER: FileKind[] = ["photo", "sheet", "print_pdf", "cover", "digital_pdf", "thumbnail", "other"];

function isMissingSchema(message: string): boolean {
  return /does not exist|could not find the function|schema cache/i.test(message);
}

function weightedAvg(rows: TotalsRow[]): number | null {
  const timed = rows.filter((r) => r.avg_ms != null);
  const weight = timed.reduce((s, r) => s + n(r.events), 0);
  return weight ? timed.reduce((s, r) => s + n(r.avg_ms) * n(r.events), 0) / weight : null;
}

export function summarizeTotals(rows: TotalsRow[]): FileEventTotals {
  const ok = (r: TotalsRow) => r.outcome === "success" || r.outcome === "pending";
  const uploads = rows.filter((r) => r.action === "upload");
  const deletes = rows.filter((r) => r.action === "delete" && r.outcome === "success");
  const sum = (list: TotalsRow[], key: "events" | "bytes" | "files" | "photos") => list.reduce((s, r) => s + n(r[key]), 0);

  const photos = uploads.filter((r) => r.kind === "photo" && r.outcome === "success" && PHOTO_UPLOAD_SOURCES.includes(r.source));
  const sheets = uploads.filter((r) => r.kind === "sheet" && r.outcome === "success" && SHEET_SOURCES.includes(r.source));
  const book = uploads.filter(
    (r) => (r.kind === "cover" || r.kind === "print_pdf" || r.kind === "digital_pdf") && r.outcome === "success",
  );
  const browserPhotos = uploads.find((r) => r.kind === "photo" && r.source === "browser" && r.outcome === "success");
  const serverSheets = uploads.filter((r) => r.kind === "sheet" && (r.source === "generated" || r.source === "edited") && ok(r));

  const bySource = new Map<FileEventSource, FileEventTotals["deletesBySource"][number]>();
  for (const r of deletes) {
    const cur = bySource.get(r.source) ?? { source: r.source, events: 0, photos: 0, files: 0, bytes: 0 };
    cur.events += n(r.events);
    cur.photos += n(r.photos);
    cur.files += n(r.files);
    cur.bytes += n(r.bytes);
    bySource.set(r.source, cur);
  }

  return {
    photosUploaded: sum(photos, "events"),
    photosUploadedBytes: sum(photos, "bytes"),
    sheetsSaved: sum(sheets, "events"),
    sheetsSavedBytes: sum(sheets, "bytes"),
    bookFiles: sum(book, "events"),
    bookFilesBytes: sum(book, "bytes"),
    thumbnails: sum(uploads.filter((r) => r.kind === "thumbnail" && r.outcome === "success"), "events"),
    uploadsSucceeded: sum(uploads.filter((r) => r.outcome === "success"), "events"),
    uploadsFailed: sum(uploads.filter((r) => r.outcome === "failed"), "events"),
    uploadsAbandoned: sum(uploads.filter((r) => r.outcome === "abandoned"), "events"),
    uploadsPending: sum(uploads.filter((r) => r.outcome === "pending"), "events"),
    browserUploadAvgMs: nOrNull(browserPhotos?.avg_ms),
    browserUploadP95Ms: nOrNull(browserPhotos?.p95_ms),
    serverWriteAvgMs: weightedAvg(serverSheets),
    deleteEvents: sum(deletes, "events"),
    photosDeleted: sum(deletes, "photos"),
    filesDeleted: sum(deletes, "files"),
    bytesFreed: sum(deletes, "bytes"),
    deletesBySource: [...bySource.values()].sort((a, b) => b.events - a.events),
  };
}

function summarizeStorage(rows: SummaryRow[]) {
  const kinds = new Map<FileKind, FileKindStorage>();
  for (const r of rows) {
    const cur =
      kinds.get(r.kind) ??
      ({
        kind: r.kind,
        objects: 0,
        bytes: 0,
        gbMonths: 0,
        orphanedObjects: 0,
        orphanedBytes: 0,
        added30dBytes: 0,
        added30dObjects: 0,
        oldest: null,
      } satisfies FileKindStorage);
    cur.objects += n(r.objects);
    cur.bytes += n(r.bytes);
    cur.gbMonths += n(r.gb_months);
    cur.added30dBytes += n(r.added_30d_bytes);
    cur.added30dObjects += n(r.added_30d_objects);
    if (r.state !== "in_use") {
      cur.orphanedObjects += n(r.objects);
      cur.orphanedBytes += n(r.bytes);
    }
    if (r.oldest && (!cur.oldest || r.oldest < cur.oldest)) cur.oldest = r.oldest;
    kinds.set(r.kind, cur);
  }
  const byKind = [...kinds.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const of = (state: SummaryRow["state"], key: "objects" | "bytes") =>
    rows.filter((r) => r.state === state).reduce((s, r) => s + n(r[key]), 0);
  return {
    byKind,
    objects: byKind.reduce((s, k) => s + k.objects, 0),
    bytes: byKind.reduce((s, k) => s + k.bytes, 0),
    gbMonths: byKind.reduce((s, k) => s + k.gbMonths, 0),
    added30dBytes: byKind.reduce((s, k) => s + k.added30dBytes, 0),
    orphanedObjects: of("orphaned", "objects"),
    orphanedBytes: of("orphaned", "bytes"),
    noAccountObjects: of("no_account", "objects"),
    noAccountBytes: of("no_account", "bytes"),
  };
}

function dailySeries(rows: Array<Record<string, number | string>>, days: number): FilesReport["daily"] {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out = Array.from({ length: days }, (_, i) => ({
    date: new Date(todayUtc - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10),
    uploads: 0,
    uploadBytes: 0,
    deletes: 0,
    deletedFiles: 0,
    deleteBytes: 0,
    failed: 0,
  }));
  const index = new Map(out.map((d, i) => [d.date, i]));
  for (const r of rows) {
    const i = index.get(String(r.day).slice(0, 10));
    if (i == null) continue;
    out[i] = {
      date: out[i].date,
      uploads: n(r.uploads),
      uploadBytes: n(r.upload_bytes),
      deletes: n(r.deletes),
      deletedFiles: n(r.deleted_files),
      deleteBytes: n(r.delete_bytes),
      failed: n(r.failed),
    };
  }
  return out;
}

/** Email and name for each id; ids with no account left are marked deleted. */
async function loadPeople(ids: Set<string>): Promise<Record<string, FilePerson>> {
  const people: Record<string, FilePerson> = {};
  if (ids.size === 0) return people;
  const [{ data: list }, { data: profiles }] = await Promise.all([
    getSupabaseAuth().auth.admin.listUsers({ perPage: 1000 }),
    getSupabaseAdmin().from("profiles").select("id, display_name").in("id", [...ids]),
  ]);
  const users = new Map((list?.users ?? []).map((u) => [u.id, u]));
  const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? null]));
  for (const id of ids) {
    const user = users.get(id);
    people[id] = { id, email: user?.email ?? null, name: names.get(id) ?? null, deleted: !user };
  }
  return people;
}

export async function getFilesReport(options: {
  periodDays: number | null;
  includeThumbnails: boolean;
}): Promise<ApiResult<FilesReport>> {
  const db = getSupabaseAdmin();
  const from = options.periodDays ? new Date(Date.now() - options.periodDays * DAY_MS).toISOString() : null;
  const [summary, totals, daily, events, largest, owners, settings] = await Promise.all([
    db.rpc("admin_storage_summary"),
    db.rpc("admin_file_event_totals", { p_from: from }),
    db.rpc("admin_file_daily", { p_days: 30 }),
    db.rpc("admin_file_events", { p_from: from, p_limit: LOG_LIMIT, p_include_thumbs: options.includeThumbnails }),
    db.rpc("admin_storage_largest", { p_limit: 10 }),
    db.rpc("admin_user_costs"),
    db.from("finance_settings").select("*").maybeSingle(),
  ]);
  const error = summary.error ?? totals.error ?? daily.error ?? events.error ?? largest.error ?? owners.error;
  if (error) {
    if (isMissingSchema(error.message)) {
      return {
        data: null,
        error: {
          message: "The file log isn't set up yet: database migration 0035 needs to be applied.",
          code: "MIGRATION_PENDING",
        },
      };
    }
    return { data: null, error: { message: error.message } };
  }

  const settingsRow = (settings.data ?? {}) as { storage_usd_per_gb_month?: number | string | null; storage_included_gb?: number | string | null };
  const rate = settingsRow.storage_usd_per_gb_month == null ? DEFAULT_STORAGE_USD_PER_GB_MONTH : Number(settingsRow.storage_usd_per_gb_month);
  const includedGb = settingsRow.storage_included_gb == null ? DEFAULT_STORAGE_INCLUDED_GB : Number(settingsRow.storage_included_gb);

  const storage = summarizeStorage((summary.data ?? []) as SummaryRow[]);
  const eventRows = (events.data ?? []) as EventRow[];
  const largestRows = (largest.data ?? []) as Array<{ name: string; kind: FileKind; owner_id: string | null; bytes: number | string; created_at: string }>;
  const ownerRows = ((owners.data ?? []) as Array<{ user_id: string; storage_objects: number | string; storage_bytes: number | string }>)
    .filter((r) => n(r.storage_bytes) > 0)
    .sort((a, b) => n(b.storage_bytes) - n(a.storage_bytes))
    .slice(0, 10);

  const ids = new Set<string>();
  for (const e of eventRows) {
    if (e.actor_id) ids.add(e.actor_id);
    if (e.owner_id) ids.add(e.owner_id);
  }
  for (const r of largestRows) if (r.owner_id) ids.add(r.owner_id);
  for (const r of ownerRows) ids.add(r.user_id);
  const people = await loadPeople(ids);
  const person = (id: string): FilePerson => people[id] ?? { id, email: null, name: null, deleted: true };

  return {
    data: {
      tracking: true,
      periodDays: options.periodDays,
      storage: {
        objects: storage.objects,
        bytes: storage.bytes,
        byKind: storage.byKind,
        orphanedObjects: storage.orphanedObjects,
        orphanedBytes: storage.orphanedBytes,
        noAccountObjects: storage.noAccountObjects,
        noAccountBytes: storage.noAccountBytes,
        added30dBytes: storage.added30dBytes,
        usdPerGbMonth: rate,
        includedGb,
        lifetimeUsd: storage.gbMonths * rate,
      },
      totals: summarizeTotals((totals.data ?? []) as TotalsRow[]),
      daily: dailySeries((daily.data ?? []) as Array<Record<string, number | string>>, 30),
      topOwners: ownerRows.map((r) => ({ person: person(r.user_id), objects: n(r.storage_objects), bytes: n(r.storage_bytes) })),
      largest: largestRows.map((r) => ({
        path: r.name,
        kind: r.kind,
        owner: r.owner_id ? person(r.owner_id) : null,
        bytes: n(r.bytes),
        at: r.created_at,
      })),
      events: eventRows.map(
        (e): FileEvent => ({
          id: e.id,
          at: e.occurred_at,
          action: e.action,
          kind: e.kind,
          source: e.source,
          outcome: e.outcome,
          ownerId: e.owner_id,
          actorId: e.actor_id,
          fileCount: e.file_count,
          photoCount: e.photo_count,
          bytes: nOrNull(e.bytes),
          path: e.storage_path,
          durationMs: e.duration_ms,
          error: e.error,
        }),
      ),
      people,
    },
    error: null,
  };
}
