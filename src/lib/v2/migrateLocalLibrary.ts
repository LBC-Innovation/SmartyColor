import * as library from "@/lib/library/client";
import { inferPhotoLayout } from "@/lib/photo/orientation";
import { dataUrlToBlob } from "@/lib/photo/dataUrlBlob";
import { readBlobImageSize } from "@/lib/photo/readImageSize";
import {
  clearV2ProjectSession,
  defaultNewProjectName,
  loadV2ProjectSession,
  loadV2ProjectsMeta,
  saveV2ProjectSession,
  saveV2ProjectsMeta,
} from "@/lib/v2/studioSessionDb";
import { emptyV2StudioSnapshot, normalizeV2SheetRevisions } from "@/lib/v2/studioTypes";
import { primeImageCache } from "@/lib/v2/imageCache";

/**
 * One-time move of a guest (IndexedDB) library into the signed-in user's cloud
 * library. Originals and every sheet revision are uploaded; local copies are
 * then cleared so the device no longer holds a second source of truth.
 */

export type LocalLibrarySummary = { projects: number; photos: number };

export async function summarizeLocalLibrary(): Promise<LocalLibrarySummary> {
  if (typeof indexedDB === "undefined") return { projects: 0, photos: 0 };
  try {
    const meta = await loadV2ProjectsMeta();
    let photos = 0;
    for (const p of meta.projects) {
      const session = await loadV2ProjectSession(p.id);
      photos += session.photos.filter((photo) => !photo.remote).length;
    }
    return { projects: meta.projects.length, photos };
  } catch {
    return { projects: 0, photos: 0 };
  }
}

export type MigrationProgress = { done: number; total: number; label: string };

export async function migrateLocalLibraryToCloud(
  onProgress?: (p: MigrationProgress) => void,
): Promise<{ projects: number; photos: number }> {
  const meta = await loadV2ProjectsMeta();
  const sessions = await Promise.all(
    meta.projects.map(async (p) => ({ meta: p, session: await loadV2ProjectSession(p.id) })),
  );
  const total = sessions.reduce((n, s) => n + s.session.photos.filter((ph) => !ph.remote).length, 0);
  let done = 0;
  let migratedProjects = 0;

  for (const { meta: project, session } of sessions) {
    const localPhotos = session.photos.filter((ph) => !ph.remote);
    if (localPhotos.length === 0) continue;

    const created = await library.createProject(project.name);
    if (created.error) throw new Error(created.error.message);
    const cloudProjectId = created.data!.id;
    migratedProjects += 1;

    for (const photo of localPhotos) {
      onProgress?.({ done, total, label: photo.fileName ?? "photo" });
      const blob = dataUrlToBlob(photo.photoDataUrl);
      const mime = blob.type || "image/jpeg";
      const size = await readBlobImageSize(blob);
      const layout = inferPhotoLayout(size.width, size.height);

      const ticket = await library.createPhotoUpload(cloudProjectId, mime);
      if (ticket.error) throw new Error(ticket.error.message);
      const put = await library.putToSignedUrl(ticket.data!, blob, mime);
      if (put.error) throw new Error(put.error.message);
      const registered = await library.registerPhoto(cloudProjectId, {
        id: ticket.data!.photoId,
        mimeType: mime,
        width: layout.width,
        height: layout.height,
        orientation: layout.orientation,
        aspectRatio: layout.aspectRatio,
        fileName: photo.fileName ?? null,
        capturedAt: photo.capturedAt ?? null,
        printPrefs: photo.printPrefs,
      });
      if (registered.error) throw new Error(registered.error.message);
      await primeImageCache(registered.data!.storagePath, blob);

      // Carry over caption/chat/crop/summary.
      await library.updatePhoto(ticket.data!.photoId, {
        userCaption: photo.userCaption ?? "",
        chatMessages: photo.chatMessages ?? [],
        photoSummary: photo.photoSummary ?? null,
        crop: photo.crop ?? null,
      });

      const revisions = normalizeV2SheetRevisions(photo);
      // Sheets drawn from a portrait version point at it by id; ids change on upload.
      const cloudRevisionIds = new Map<string, string>();
      for (const rev of revisions) {
        const sheetBlob = dataUrlToBlob(rev.sheet.imageDataUrl);
        const sheetMime = sheetBlob.type || rev.sheet.mimeType || "image/png";
        const revTicket = await library.createRevisionUpload(ticket.data!.photoId, sheetMime);
        if (revTicket.error) throw new Error(revTicket.error.message);
        const revPut = await library.putToSignedUrl(revTicket.data!, sheetBlob, sheetMime);
        if (revPut.error) throw new Error(revPut.error.message);
        const isActive = rev.id === (photo.activeRevisionId ?? revisions[revisions.length - 1]?.id);
        const reg = await library.registerRevision(ticket.data!.photoId, {
          revisionId: revTicket.data!.revisionId,
          mimeType: sheetMime,
          title: rev.sheet.title,
          makeActive: isActive,
          kind: rev.kind,
          orientation: rev.orientation,
          sourceRevisionId: rev.sourceRevisionId ? cloudRevisionIds.get(rev.sourceRevisionId) : undefined,
        });
        if (reg.error) throw new Error(reg.error.message);
        cloudRevisionIds.set(rev.id, revTicket.data!.revisionId);
        await primeImageCache(revTicket.data!.path, sheetBlob);
      }
      done += 1;
      onProgress?.({ done, total, label: photo.fileName ?? "photo" });
    }
  }

  // Local library is now redundant: clear it and leave one fresh empty project for guest mode.
  for (const p of meta.projects) await clearV2ProjectSession(p.id);
  const freshId = crypto.randomUUID();
  await saveV2ProjectSession(freshId, emptyV2StudioSnapshot());
  await saveV2ProjectsMeta({
    activeProjectId: freshId,
    projects: [{ id: freshId, name: defaultNewProjectName(0), updatedAt: new Date().toISOString(), photoCount: 0 }],
  });

  return { projects: migratedProjects, photos: done };
}
