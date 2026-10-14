import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { LIBRARY_READ_URL_TTL_SECONDS, type SignedUpload } from "@/lib/library/types";

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

/** Signed PUT target so the browser uploads straight to storage (bypasses Vercel body limits). */
export async function createSignedUpload(path: string): Promise<SignedUpload> {
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(error?.message ?? "Could not create upload URL");
  return { path: data.path, url: data.signedUrl, token: data.token };
}

export async function objectExists(path: string): Promise<boolean> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await bucket().list(dir, { search: name, limit: 1 });
  if (error) throw new Error(error.message);
  return Boolean(data?.some((o) => o.name === name));
}

export async function putObject(path: string, bytes: Buffer | Uint8Array, mime: string): Promise<void> {
  const { error } = await bucket().upload(path, bytes, { contentType: mime, upsert: true });
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

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await bucket().remove(paths);
  if (error) throw new Error(error.message);
}

/** Remove everything under a prefix (a photo folder or a whole project). */
export async function removePrefix(prefix: string): Promise<void> {
  const files: string[] = [];
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
        else files.push(full);
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  };
  await walk(prefix);
  for (let i = 0; i < files.length; i += 100) {
    await removeObjects(files.slice(i, i + 100));
  }
}
