import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { LIBRARY_READ_URL_TTL_SECONDS, type SignedUpload } from "@/lib/library/types";
import type { FileEventSource } from "@/lib/files/types";
import { fileKindForPath, recordFileEvent, type FileAudit } from "@/server/storage/fileAudit";

/**
 * All image bytes for the v2 library live in the private "library" bucket.
 * This is the only module that knows the bucket and path layout, so a
 * different store later is a swap here rather than a rewrite.
 */
export const LIBRARY_BUCKET = "library";

function bucket() {
  return getSupabaseAdmin().storage.from(LIBRARY_BUCKET);
}

export function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  return "bin";
}

export const libraryPaths = {
  project: (userId: string, projectId: string) => `${userId}/${projectId}`,
  photoDir: (userId: string, projectId: string, photoId: string) => `${userId}/${projectId}/${photoId}`,
  original: (userId: string, projectId: string, photoId: string, mime: string) =>
    `${userId}/${projectId}/${photoId}/original.${extensionForMime(mime)}`,
  /** A rewritten original. Clients cache bytes by path, so new bytes always get a new name. */
  originalVersion: (userId: string, projectId: string, photoId: string, versionId: string, mime: string) =>
    `${userId}/${projectId}/${photoId}/original-${versionId}.${extensionForMime(mime)}`,
  sheet: (userId: string, projectId: string, photoId: string, revisionId: string, mime: string) =>
    `${userId}/${projectId}/${photoId}/sheets/${revisionId}.${extensionForMime(mime)}`,
  /**
   * Tile-sized copy of any library image, kept next to it so deleting a photo's folder takes it
   * too. Made after the fact (see libraryThumbs), so it may not exist yet.
   */
  thumb: (imagePath: string) => `${imagePath}.thumb.webp`,
};

/**
 * Every write and removal below is recorded in file_events (see fileAudit). Callers that know who
 * acted and why pass a FileAudit; background work (thumbnails) is recorded without an actor.
 */

/** Signed PUT target so the browser uploads straight to storage (bypasses Vercel body limits). */
export async function createSignedUpload(path: string): Promise<SignedUpload> {
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(error?.message ?? "Could not create upload URL");
  return { path: data.path, url: data.signedUrl, token: data.token };
}

/** The stored file's size in bytes, or null when there is no file at `path`. */
export async function objectSize(path: string): Promise<number | null> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await bucket().list(dir, { search: name, limit: 1 });
  if (error) throw new Error(error.message);
  const found = data?.find((o) => o.name === name);
  if (!found) return null;
  return Number((found.metadata as { size?: number } | null)?.size ?? 0);
}

export async function objectExists(path: string): Promise<boolean> {
  return (await objectSize(path)) != null;
}

/** Where a server write comes from when the caller doesn't say. */
function defaultWriteSource(path: string): FileEventSource {
  const kind = fileKindForPath(path);
  if (kind === "thumbnail") return "thumbnail";
  if (kind === "print_pdf" || kind === "digital_pdf" || kind === "cover") return "book_order";
  return "server";
}

export async function putObject(
  path: string,
  bytes: Buffer | Uint8Array,
  mime: string,
  audit?: FileAudit,
): Promise<void> {
  const started = performance.now();
  const { error } = await bucket().upload(path, bytes, { contentType: mime, upsert: true });
  await recordFileEvent({
    action: "upload",
    path,
    outcome: error ? "failed" : "success",
    source: defaultWriteSource(path),
    audit,
    bytes: bytes.byteLength,
    durationMs: performance.now() - started,
    error: error?.message,
  });
  if (error) throw new Error(error.message);
}

/** Server-side copy inside the bucket; the bytes never leave storage. */
export async function copyObject(fromPath: string, toPath: string, audit?: FileAudit): Promise<void> {
  const started = performance.now();
  const { error } = await bucket().copy(fromPath, toPath);
  await recordFileEvent({
    action: "upload",
    path: toPath,
    outcome: error ? "failed" : "success",
    source: "copied",
    audit,
    durationMs: performance.now() - started,
    error: error?.message,
  });
  if (error) throw new Error(error.message);
}

export async function getObjectBytes(path: string): Promise<{ bytes: Buffer; mime: string }> {
  const { data, error } = await bucket().download(path);
  if (error || !data) throw new Error(error?.message ?? "Object not found");
  return { bytes: Buffer.from(await data.arrayBuffer()), mime: data.type || "application/octet-stream" };
}

/** Batch of short-lived read URLs, in the same order as `paths`. */
export async function signedReadUrls(
  paths: string[],
  ttlSeconds = LIBRARY_READ_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await bucket().createSignedUrls(paths, ttlSeconds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
  }
  return out;
}

/** The folder a set of paths shares, for the log ("u/p/photo" for one photo's files). */
function commonDir(paths: string[]): string {
  if (paths.length === 1) return paths[0];
  const split = paths.map((p) => p.split("/"));
  const out: string[] = [];
  for (let i = 0; i < split[0].length - 1; i++) {
    const part = split[0][i];
    if (split.every((s) => s[i] === part)) out.push(part);
    else break;
  }
  return out.join("/");
}

async function removeBatch(paths: string[]): Promise<{ files: number; bytes: number }> {
  const { data, error } = await bucket().remove(paths);
  if (error) throw new Error(error.message);
  const removed = data ?? [];
  return {
    files: removed.length,
    bytes: removed.reduce((s, o) => s + Number((o.metadata as { size?: number } | null)?.size ?? 0), 0),
  };
}

/** Remove these files. Missing ones are skipped; a delete that removed nothing isn't logged. */
export async function removeObjects(paths: string[], audit?: FileAudit): Promise<void> {
  if (paths.length === 0) return;
  const started = performance.now();
  try {
    const { files, bytes } = await removeBatch(paths);
    if (files > 0) {
      await recordFileEvent({
        action: "delete",
        path: commonDir(paths),
        kind: fileKindForPath(paths[0]),
        outcome: "success",
        source: "cleanup",
        audit,
        fileCount: files,
        bytes,
        durationMs: performance.now() - started,
      });
    }
  } catch (e) {
    await recordFileEvent({
      action: "delete",
      path: commonDir(paths),
      kind: fileKindForPath(paths[0]),
      outcome: "failed",
      source: "cleanup",
      audit,
      fileCount: paths.length,
      durationMs: performance.now() - started,
      error: e,
    });
    throw e;
  }
}

/** Remove everything under a prefix (a photo folder, a whole album, or an account). */
export async function removePrefix(prefix: string, audit?: FileAudit): Promise<void> {
  const started = performance.now();
  const files: Array<{ path: string; size: number }> = [];
  const walk = async (dir: string) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await bucket().list(dir, { limit: 1000, offset });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const entry of data) {
        const full = `${dir}/${entry.name}`;
        // Folders come back without an id/metadata.
        if (entry.id == null && !entry.metadata) await walk(full);
        else files.push({ path: full, size: Number((entry.metadata as { size?: number } | null)?.size ?? 0) });
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  };
  // A photo's or album's folder is mostly photos and their pages; a whole account is everything.
  const kind = prefix.split("/").length >= 2 ? "photo" : "other";
  let removedFiles = 0;
  let removedBytes = 0;
  try {
    await walk(prefix);
    for (let i = 0; i < files.length; i += 100) {
      const done = await removeBatch(files.slice(i, i + 100).map((f) => f.path));
      removedFiles += done.files;
      removedBytes += done.bytes;
    }
  } catch (e) {
    await recordFileEvent({
      action: "delete",
      path: prefix,
      kind,
      outcome: "failed",
      source: "cleanup",
      audit,
      fileCount: removedFiles,
      bytes: removedBytes,
      durationMs: performance.now() - started,
      error: e,
    });
    throw e;
  }
  if (removedFiles > 0 || audit?.source) {
    await recordFileEvent({
      action: "delete",
      path: prefix,
      kind,
      outcome: "success",
      source: "cleanup",
      audit,
      fileCount: removedFiles,
      // Remove's response usually carries sizes; fall back to the listing's.
      bytes: removedBytes || files.reduce((s, f) => s + f.size, 0),
      durationMs: performance.now() - started,
    });
  }
}
