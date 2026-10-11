import * as library from "@/lib/library/client";
import { cachedImageUrl } from "@/lib/v2/imageCache";
import { loadV2ProjectSession, loadV2ProjectsMeta } from "@/lib/v2/studioSessionDb";
import type { V2ProjectMeta } from "@/lib/v2/studioTypes";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import { normalizeV2SheetRevisions, photoOrientation } from "@/lib/v2/studioTypes";

export async function loadProjectsCatalog(cloud = false): Promise<V2ProjectMeta[]> {
  if (cloud) {
    const res = await library.listProjects();
    if (res.error) throw new Error(res.error.message);
    return res.data!.map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, photoCount: p.photoCount }));
  }
  const meta = await loadV2ProjectsMeta();
  return meta.projects;
}

async function collectCloudPages(projectIds: string[], nameById: Map<string, string>) {
  const pages: BookWizardPhotoPage[] = [];
  let skippedWithoutSheet = 0;
  for (const projectId of projectIds) {
    const res = await library.listPhotos(projectId);
    if (res.error) throw new Error(res.error.message);
    for (const photo of res.data!) {
      const active =
        photo.revisions.find((r) => r.id === photo.activeRevisionId) ??
        photo.revisions[photo.revisions.length - 1];
      if (!active) {
        skippedWithoutSheet += 1;
        continue;
      }
      pages.push({
        id: `${projectId}:${photo.id}`,
        kind: "photo",
        sourceProjectId: projectId,
        sourceProjectName: nameById.get(projectId) ?? "Album",
        photoId: photo.id,
        revisionId: active.id,
        title: active.title,
        imageDataUrl: await cachedImageUrl(active.storagePath, active.url),
        sheetOrientation: (photo.orientation as BookWizardPhotoPage["sheetOrientation"]) ?? photo.printPrefs.orientation,
        rotation: 0,
      });
    }
  }
  return { pages, skippedWithoutSheet };
}

export async function collectPhotoPagesFromProjects(input: {
  projectIds: string[];
  projects: V2ProjectMeta[];
  cloud?: boolean;
}): Promise<{ pages: BookWizardPhotoPage[]; skippedWithoutSheet: number }> {
  const nameById = new Map(input.projects.map((p) => [p.id, p.name]));
  if (input.cloud) return collectCloudPages(input.projectIds, nameById);
  const pages: BookWizardPhotoPage[] = [];
  let skippedWithoutSheet = 0;

  for (const projectId of input.projectIds) {
    const session = await loadV2ProjectSession(projectId);
    const projectName = nameById.get(projectId) ?? "Album";
    for (const photo of session.photos) {
      const revisions = normalizeV2SheetRevisions(photo);
      const active =
        revisions.find((r) => r.id === photo.activeRevisionId)?.sheet ??
        photo.sheet ??
        revisions[revisions.length - 1]?.sheet;
      if (!active) {
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
        sheetOrientation: photoOrientation(photo),
        rotation: 0,
      });
    }
  }

  return { pages, skippedWithoutSheet };
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
