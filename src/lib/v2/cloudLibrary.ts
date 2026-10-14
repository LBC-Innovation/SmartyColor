import * as library from "@/lib/library/client";
import type { LibraryPhoto, LibraryProject, LibraryRevision } from "@/lib/library/types";
import type { GeneratedSheet, SheetVersion } from "@/lib/session/types";
import type { PrintPrefs } from "@/lib/print/settings";
import type { PhotoLayout } from "@/lib/photo/orientation";
import { dataUrlToBlob } from "@/lib/photo/dataUrlBlob";
import { cachedImageUrl, evictImages, peekCachedImageUrls, primeImageCache } from "@/lib/v2/imageCache";
import type { V2PhotoEntry, V2ProjectMeta } from "@/lib/v2/studioTypes";

/**
 * Glue between the cloud library API and the studio's in-memory model.
 * Image bytes come through the cache, so entries carry object URLs, never base64.
 */

export function isCloudPhoto(entry: Pick<V2PhotoEntry, "remote">): boolean {
  return Boolean(entry.remote);
}

export function projectMetaFromLibrary(p: LibraryProject): V2ProjectMeta {
  return {
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    photoCount: p.photoCount,
    role: p.role,
    ownerName: p.ownerName,
    sharedCount: p.sharedCount,
  };
}

type ImageUrlFor = (path: string, signedUrl: string) => string;

function versionFromRevision(rev: LibraryRevision, urlFor: ImageUrlFor): SheetVersion {
  return {
    id: rev.id,
    createdAt: rev.createdAt,
    sheet: {
      title: rev.title,
      mimeType: rev.mimeType,
      imageDataUrl: urlFor(rev.storagePath, rev.url),
      storagePath: rev.storagePath,
      thumbUrl: rev.thumbUrl,
    },
    kind: rev.kind,
    orientation: (rev.orientation as SheetVersion["orientation"] | null) ?? undefined,
    sourceRevisionId: rev.sourceRevisionId,
  };
}

function buildEntry(
  p: LibraryPhoto,
  urlFor: ImageUrlFor,
  transient?: Partial<Pick<V2PhotoEntry, "generating" | "correcting">>,
): V2PhotoEntry {
  const revisions = p.revisions.map((rev) => versionFromRevision(rev, urlFor));
  const active =
    revisions.find((r) => r.id === p.activeRevisionId) ?? revisions[revisions.length - 1] ?? null;

  return {
    id: p.id,
    remote: { photoId: p.id, projectId: p.projectId, storagePath: p.storagePath },
    canDelete: p.canDelete,
    previewUrl: urlFor(p.storagePath, p.url),
    thumbUrl: p.thumbUrl,
    photoDataUrl: "",
    image:
      p.width && p.height && p.orientation && p.aspectRatio
        ? {
            width: p.width,
            height: p.height,
            orientation: p.orientation as PhotoLayout["orientation"],
            aspectRatio: p.aspectRatio as PhotoLayout["aspectRatio"],
          }
        : undefined,
    printPrefs: p.printPrefs,
    sheet: active?.sheet ?? null,
    sheetRevisions: revisions,
    activeRevisionId: active?.id ?? null,
    editCount: p.editCount,
    generating: transient?.generating ?? false,
    correcting: transient?.correcting ?? false,
    capturedAt: p.capturedAt ?? undefined,
    fileName: p.fileName ?? undefined,
    userCaption: p.userCaption,
    chatMessages: p.chatMessages,
    photoSummary: p.photoSummary,
    crop: p.crop,
  };
}

function imagePaths(p: LibraryPhoto): { path: string; url: string }[] {
  return [{ path: p.storagePath, url: p.url }, ...p.revisions.map((r) => ({ path: r.storagePath, url: r.url }))];
}

/** Full entry for a library photo; resolves (and caches) every image URL. */
export async function entryFromLibraryPhoto(
  p: LibraryPhoto,
  transient?: Partial<Pick<V2PhotoEntry, "generating" | "correcting">>,
): Promise<V2PhotoEntry> {
  const images = imagePaths(p);
  const urls = await Promise.all(images.map((i) => cachedImageUrl(i.path, i.url)));
  const byPath = new Map(images.map((i, n) => [i.path, urls[n]]));
  return buildEntry(p, (path, signedUrl) => byPath.get(path) ?? signedUrl, transient);
}

/** An image an entry still shows from its signed URL because the bytes aren't cached yet. */
export type PendingLibraryImage = { photoId: string; path: string; url: string };

/**
 * Entries for a whole album without waiting on image downloads. Images already on this device
 * get their cached object URL; the rest keep their signed URL and are listed in `pending`, for
 * `resolveLibraryImages` to fetch in the background.
 */
export async function entriesFromLibraryPhotosNow(
  photos: LibraryPhoto[],
): Promise<{ entries: V2PhotoEntry[]; pending: PendingLibraryImage[] }> {
  const cached = await peekCachedImageUrls(photos.flatMap((p) => imagePaths(p).map((i) => i.path)));
  const pending: PendingLibraryImage[] = [];
  const seen = new Set<string>();
  for (const p of photos) {
    for (const i of imagePaths(p)) {
      if (cached.has(i.path) || seen.has(i.path) || !i.url) continue;
      seen.add(i.path);
      pending.push({ photoId: p.id, ...i });
    }
  }
  const entries = photos.map((p) => buildEntry(p, (path, signedUrl) => cached.get(path) ?? signedUrl));
  return { entries, pending };
}

const RESOLVE_CONCURRENCY = 3;

/**
 * Download and cache pending images a few at a time, `first` photo's images ahead of the rest.
 * `onResolved` gets each batch of path → object URL as it lands; stops early once `cancelled()`.
 */
export async function resolveLibraryImages(
  pending: PendingLibraryImage[],
  opts: { first?: string | null; cancelled: () => boolean; onResolved: (urls: Map<string, string>) => void },
): Promise<void> {
  const queue = [
    ...pending.filter((i) => i.photoId === opts.first),
    ...pending.filter((i) => i.photoId !== opts.first),
  ];
  const worker = async () => {
    for (let item = queue.shift(); item && !opts.cancelled(); item = queue.shift()) {
      try {
        const url = await cachedImageUrl(item.path, item.url);
        if (!opts.cancelled()) opts.onResolved(new Map([[item.path, url]]));
      } catch {
        /* keep the signed URL; the next album load tries again */
      }
    }
  };
  await Promise.all(Array.from({ length: RESOLVE_CONCURRENCY }, worker));
}

/** Point an entry's images at freshly cached object URLs, wherever it still shows a signed URL. */
export function applyResolvedImageUrls(entry: V2PhotoEntry, urls: Map<string, string>): V2PhotoEntry {
  const swap = (path: string | undefined, current: string): string => {
    if (!path || current.startsWith("blob:") || current.startsWith("data:")) return current;
    return urls.get(path) ?? current;
  };
  const previewUrl = swap(entry.remote?.storagePath, entry.previewUrl);
  let changed = previewUrl !== entry.previewUrl;
  const sheetRevisions = entry.sheetRevisions?.map((v) => {
    const imageDataUrl = swap(v.sheet.storagePath, v.sheet.imageDataUrl);
    if (imageDataUrl === v.sheet.imageDataUrl) return v;
    changed = true;
    return { ...v, sheet: { ...v.sheet, imageDataUrl } };
  });
  let sheet = entry.sheet;
  if (sheet) {
    const imageDataUrl = swap(sheet.storagePath, sheet.imageDataUrl);
    if (imageDataUrl !== sheet.imageDataUrl) {
      changed = true;
      sheet = { ...sheet, imageDataUrl };
    }
  }
  return changed ? { ...entry, previewUrl, sheet, sheetRevisions } : entry;
}

/** Upload a prepared original and register it. Returns the studio entry. */
export async function uploadPhotoToLibrary(input: {
  projectId: string;
  blob: Blob;
  mimeType: string;
  layout: PhotoLayout;
  printPrefs: PrintPrefs;
  fileName?: string | null;
  capturedAt?: string | null;
}): Promise<V2PhotoEntry> {
  const ticket = await library.createPhotoUpload(input.projectId, input.mimeType);
  if (ticket.error) throw new Error(ticket.error.message);
  const put = await library.putToSignedUrl(ticket.data!, input.blob, input.mimeType);
  if (put.error) throw new Error(put.error.message);

  const registered = await library.registerPhoto(input.projectId, {
    id: ticket.data!.photoId,
    mimeType: input.mimeType,
    width: input.layout.width,
    height: input.layout.height,
    orientation: input.layout.orientation,
    aspectRatio: input.layout.aspectRatio,
    fileName: input.fileName ?? null,
    capturedAt: input.capturedAt ?? null,
    printPrefs: input.printPrefs,
  });
  if (registered.error) throw new Error(registered.error.message);

  // We already hold the bytes: seed the cache so the thumbnail never re-downloads.
  await primeImageCache(registered.data!.storagePath, input.blob);
  return entryFromLibraryPhoto(registered.data!);
}

/** Upload a sheet produced client-side (overlay composite, migration) as a new revision. */
export async function uploadRevisionToLibrary(input: {
  photoId: string;
  sheet: GeneratedSheet;
  makeActive?: boolean;
  meta?: Pick<SheetVersion, "kind" | "orientation" | "sourceRevisionId">;
}): Promise<LibraryPhoto> {
  const blob = dataUrlToBlob(input.sheet.imageDataUrl);
  const mime = blob.type || input.sheet.mimeType || "image/png";
  const ticket = await library.createRevisionUpload(input.photoId, mime);
  if (ticket.error) throw new Error(ticket.error.message);
  const put = await library.putToSignedUrl(ticket.data!, blob, mime);
  if (put.error) throw new Error(put.error.message);
  const registered = await library.registerRevision(input.photoId, {
    revisionId: ticket.data!.revisionId,
    mimeType: mime,
    title: input.sheet.title,
    makeActive: input.makeActive ?? true,
    ...input.meta,
  });
  if (registered.error) throw new Error(registered.error.message);
  await primeImageCache(ticket.data!.path, blob);
  return registered.data!;
}

/** Keys of an entry that are persisted server-side (everything else is transient or derived). */
export const PERSISTED_PHOTO_KEYS = [
  "printPrefs",
  "userCaption",
  "chatMessages",
  "photoSummary",
  "crop",
  "activeRevisionId",
] as const;

export function pickPersistedPatch(patch: Partial<V2PhotoEntry>) {
  const out: Record<string, unknown> = {};
  for (const key of PERSISTED_PHOTO_KEYS) {
    if (key in patch) out[key] = patch[key];
  }
  return out as Parameters<typeof library.updatePhoto>[1];
}

export async function evictEntryImages(entries: V2PhotoEntry[]): Promise<void> {
  const paths: string[] = [];
  for (const e of entries) {
    if (e.remote) paths.push(e.remote.storagePath);
    for (const r of e.sheetRevisions ?? []) if (r.sheet.storagePath) paths.push(r.sheet.storagePath);
  }
  await evictImages(paths);
}
