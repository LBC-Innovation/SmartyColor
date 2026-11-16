import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import type { FileEventSource, FileKind } from "@/lib/files/types";

/**
 * The file_events log behind the admin Files page (migration 0035). Best effort throughout: the
 * write or delete it describes has already happened (or failed on its own), so a logging failure
 * must never change the outcome.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who and why, passed by callers that know; everything else is read from the path. */
export type FileAudit = {
  actorId?: string | null;
  source?: FileEventSource;
  /** Library photos a delete removes. */
  photoCount?: number;
};

/** What kind of file a library path holds. Mirrors public.library_file_kind() in SQL. */
export function fileKindForPath(path: string): FileKind {
  const parts = path.split("/");
  if (path.endsWith(".thumb.webp")) return "thumbnail";
  if (parts[1] === "_orders") {
    if (/\/cover-front\.[a-z]+$/.test(path)) return "cover";
    if (/\/(interior|cover)\.pdf$/.test(path)) return "print_pdf";
    if (/\.pdf$/.test(path)) return "digital_pdf";
    return "other";
  }
  if (parts[3] === "sheets") return "sheet";
  if (parts[3]?.startsWith("original")) return "photo";
  return "other";
}

/** Whose folder a path is in: its first segment, when that is an account id. */
export function ownerForPath(path: string): string | null {
  const first = path.split("/")[0];
  return UUID_RE.test(first) ? first : null;
}

function warn(message: string, ctx: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "warn", message, ...ctx }));
}

function errorText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

export async function recordFileEvent(input: {
  action: "upload" | "delete";
  path: string;
  outcome: "pending" | "success" | "failed";
  audit?: FileAudit;
  source: FileEventSource;
  fileCount?: number | null;
  bytes?: number | null;
  durationMs?: number | null;
  uploadId?: string | null;
  error?: unknown;
  kind?: FileKind;
}): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("file_events")
      .insert({
        action: input.action,
        kind: input.kind ?? fileKindForPath(input.path),
        source: input.audit?.source ?? input.source,
        outcome: input.outcome,
        owner_id: ownerForPath(input.path),
        actor_id: input.audit?.actorId ?? null,
        file_count: input.fileCount === undefined ? 1 : input.fileCount,
        photo_count: input.audit?.photoCount ?? null,
        bytes: input.bytes ?? null,
        storage_path: input.path,
        upload_id: input.uploadId ?? null,
        duration_ms: input.durationMs == null ? null : Math.round(input.durationMs),
        error: input.error == null ? null : errorText(input.error),
        finished_at: input.outcome === "pending" ? null : new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
  } catch (e) {
    warn("File event could not be recorded", { action: input.action, path: input.path, error: errorText(e) });
  }
}

/**
 * A browser upload is starting: the signed URL for `path` was issued. The row stays pending until
 * {@link finishSignedUpload}, or the admin report resolves it against storage.
 */
export function startSignedUpload(input: { path: string; uploadId: string; actorId: string; source?: FileEventSource }) {
  return recordFileEvent({
    action: "upload",
    path: input.path,
    outcome: "pending",
    source: input.source ?? "browser",
    audit: { actorId: input.actorId },
    uploadId: input.uploadId,
  });
}

/** The signed URL couldn't be issued: the upload failed before it started. */
export function failSignedUpload(input: { path: string; actorId: string; error: unknown; source?: FileEventSource }) {
  return recordFileEvent({
    action: "upload",
    path: input.path,
    outcome: "failed",
    source: input.source ?? "browser",
    audit: { actorId: input.actorId },
    error: input.error,
  });
}

/** The app registered (or couldn't register) a browser upload; closes its pending row. */
export async function finishSignedUpload(input: {
  uploadId: string;
  path: string;
  actorId: string;
  ok: boolean;
  bytes?: number | null;
  error?: unknown;
  source?: FileEventSource;
}): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().rpc("finish_file_upload", {
      p_upload_id: input.uploadId,
      p_outcome: input.ok ? "success" : "failed",
      p_bytes: input.bytes ?? null,
      p_error: input.error == null ? null : errorText(input.error),
      p_row: {
        kind: fileKindForPath(input.path),
        source: input.source ?? "browser",
        owner_id: ownerForPath(input.path),
        actor_id: input.actorId,
        storage_path: input.path,
      },
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    warn("File upload could not be closed", { uploadId: input.uploadId, error: errorText(e) });
  }
}
