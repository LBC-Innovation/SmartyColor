import * as library from "@/lib/library/client";
import type { LibraryPhoto, LibraryProject, LibraryRevision } from "@/lib/library/types";
import type { GeneratedSheet, SheetVersion } from "@/lib/session/types";
import type { PrintPrefs } from "@/lib/print/settings";
import type { PhotoLayout } from "@/lib/photo/orientation";
import { dataUrlToBlob } from "@/lib/photo/dataUrlBlob";
import { cachedImageUrl, evictImages, primeImageCache } from "@/lib/v2/imageCache";
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

async function revisionToVersion(rev: LibraryRevision): Promise<SheetVersion> {
  const url = await cachedImageUrl(rev.storagePath, rev.url);
  return {
    id: rev.id,
    createdAt: rev.createdAt,
    sheet: { title: rev.title, mimeType: rev.mimeType, imageDataUrl: url, storagePath: rev.storagePath },
  };
}

/** Full entry for a library photo; resolves (and caches) every image URL. */
export async function entryFromLibraryPhoto(
  p: LibraryPhoto,
  transient?: Partial<Pick<V2PhotoEntry, "generating" | "correcting">>,
): Promise<V2PhotoEntry> {
  const [previewUrl, revisions] = await Promise.all([
    cachedImageUrl(p.storagePath, p.url),
    Promise.all(p.revisions.map(revisionToVersion)),
  ]);
  const active =
    revisions.find((r) => r.id === p.activeRevisionId) ?? revisions[revisions.length - 1] ?? null;

  return {
    id: p.id,
    remote: { photoId: p.id, projectId: p.projectId, storagePath: p.storagePath },
    canDelete: p.canDelete,
    previewUrl,
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

export async function entriesFromLibraryPhotos(photos: LibraryPhoto[]): Promise<V2PhotoEntry[]> {
  return Promise.all(photos.map((p) => entryFromLibraryPhoto(p)));
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
