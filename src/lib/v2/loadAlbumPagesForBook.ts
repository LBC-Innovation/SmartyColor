import * as library from "@/lib/library/client";
import { cachedImageUrl } from "@/lib/v2/imageCache";
import { loadV2ProjectSession, loadV2ProjectsMeta } from "@/lib/v2/studioSessionDb";
import { projectMetaFromLibrary } from "@/lib/v2/cloudLibrary";
import type { V2ProjectMeta } from "@/lib/v2/studioTypes";
import type { LibraryPhoto, LibraryRevision } from "@/lib/library/types";
import type { BookWizardPendingPhoto, BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import { activeSheetVersion, normalizeV2SheetRevisions, photoOrientation } from "@/lib/v2/studioTypes";

export async function loadProjectsCatalog(cloud = false): Promise<V2ProjectMeta[]> {
  if (cloud) {
    const res = await library.listProjects();
    if (res.error) throw new Error(res.error.message);
    return res.data!.map(projectMetaFromLibrary);
  }
  const meta = await loadV2ProjectsMeta();
  return meta.projects;
}

/** Newest AI portrait version of a library photo, if it has one. */
function portraitVersionOf(photo: LibraryPhoto): LibraryRevision | undefined {
  return photo.revisions.filter((r) => r.kind === "photo" && r.orientation !== "landscape").at(-1);
}

/**
 * A library photo as the book sees it: a page when its active version is a
 * coloring sheet, otherwise a photo still waiting for one.
 */
export async function bookEntryFromLibraryPhoto(
  photo: LibraryPhoto,
  projectId: string,
  projectName: string,
): Promise<{ page: BookWizardPhotoPage } | { pending: BookWizardPendingPhoto }> {
  const id = `${projectId}:${photo.id}`;
  const active =
    photo.revisions.find((r) => r.id === photo.activeRevisionId) ??
    photo.revisions[photo.revisions.length - 1];
  const portraitRevisionId = portraitVersionOf(photo)?.id;
  // A portrait photo version is not a coloring page until a sheet is drawn from it.
  if (!active || active.kind === "photo") {
    const shown = active ?? null;
    return {
      pending: {
        id,
        sourceProjectId: projectId,
        sourceProjectName: projectName,
        photoId: photo.id,
        title: photo.fileName ?? "Photo",
        imageUrl: shown?.thumbUrl ?? shown?.url ?? photo.thumbUrl ?? photo.url,
        orientation:
          ((shown?.orientation ?? photo.orientation) as BookWizardPendingPhoto["orientation"] | null) ??
          photo.printPrefs.orientation,
        ...(shown ? { sourceRevisionId: shown.id } : {}),
        ...(portraitRevisionId ? { portraitRevisionId } : {}),
      },
    };
  }
  return {
    page: {
      id,
      kind: "photo",
      sourceProjectId: projectId,
      sourceProjectName: projectName,
      photoId: photo.id,
      revisionId: active.id,
      title: active.title,
      imageDataUrl: await cachedImageUrl(active.storagePath, active.url),
      photoSource: { storagePath: photo.storagePath, url: photo.url },
      sheetOrientation:
        ((active.orientation ?? photo.orientation) as BookWizardPhotoPage["sheetOrientation"] | null) ??
        photo.printPrefs.orientation,
      rotation: 0,
      ...(portraitRevisionId ? { portraitRevisionId } : {}),
    },
  };
}

async function collectCloudPages(projectIds: string[], nameById: Map<string, string>) {
  const pages: BookWizardPhotoPage[] = [];
  const pending: BookWizardPendingPhoto[] = [];
  const albumOrder: string[] = [];
  for (const projectId of projectIds) {
    const res = await library.listPhotos(projectId);
    if (res.error) throw new Error(res.error.message);
    for (const photo of res.data!) {
      const entry = await bookEntryFromLibraryPhoto(photo, projectId, nameById.get(projectId) ?? "Album");
      if ("page" in entry) {
        pages.push(entry.page);
        albumOrder.push(entry.page.id);
      } else {
        pending.push(entry.pending);
        albumOrder.push(entry.pending.id);
      }
    }
  }
  return { pages, pending, albumOrder, skippedWithoutSheet: pending.length };
}

export async function collectPhotoPagesFromProjects(input: {
  projectIds: string[];
  projects: V2ProjectMeta[];
  cloud?: boolean;
}): Promise<{
  pages: BookWizardPhotoPage[];
  /** Photos without a coloring sheet (cloud libraries only). */
  pending: BookWizardPendingPhoto[];
  /** Every photo's page id, in album order. */
  albumOrder: string[];
  skippedWithoutSheet: number;
}> {
  const nameById = new Map(input.projects.map((p) => [p.id, p.name]));
  if (input.cloud) return collectCloudPages(input.projectIds, nameById);
  const pages: BookWizardPhotoPage[] = [];
  let skippedWithoutSheet = 0;

  for (const projectId of input.projectIds) {
    const session = await loadV2ProjectSession(projectId);
    const projectName = nameById.get(projectId) ?? "Album";
    for (const photo of session.photos) {
      const revisions = normalizeV2SheetRevisions(photo);
      const version = activeSheetVersion({ ...photo, sheetRevisions: revisions });
      const active = version?.sheet ?? photo.sheet;
      if (!active || version?.kind === "photo") {
        skippedWithoutSheet += 1;
        continue;
      }
      pages.push({
        id: `${projectId}:${photo.id}`,
        kind: "photo",
        sourceProjectId: projectId,
        sourceProjectName: projectName,
        photoId: photo.id,
        title: active.title,
        imageDataUrl: active.imageDataUrl,
        sheetOrientation: version?.orientation ?? photoOrientation(photo),
        rotation: 0,
      });
    }
  }

  return { pages, pending: [], albumOrder: pages.map((p) => p.id), skippedWithoutSheet };
}

/** How many photos in a project have a coloring sheet (i.e. would become book pages). */
export async function countProjectSheets(projectId: string, cloud = false): Promise<number> {
  if (cloud) {
    const res = await library.listPhotos(projectId);
    if (res.error) return 0;
    return res.data!.filter((p) => p.revisions.length > 0).length;
  }
  const session = await loadV2ProjectSession(projectId);
  let count = 0;
  for (const photo of session.photos) {
    const revisions = normalizeV2SheetRevisions(photo);
    if (photo.sheet || revisions.length > 0) count += 1;
  }
  return count;
}
