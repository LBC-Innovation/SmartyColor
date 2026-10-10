import { loadV2ProjectSession, loadV2ProjectsMeta } from "@/lib/v2/studioSessionDb";
import type { V2ProjectMeta } from "@/lib/v2/studioTypes";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import { normalizeV2SheetRevisions } from "@/lib/v2/studioTypes";

export async function loadProjectsCatalog(): Promise<V2ProjectMeta[]> {
  const meta = await loadV2ProjectsMeta();
  return meta.projects;
}

export async function collectPhotoPagesFromProjects(input: {
  projectIds: string[];
  projects: V2ProjectMeta[];
}): Promise<{ pages: BookWizardPhotoPage[]; skippedWithoutSheet: number }> {
  const nameById = new Map(input.projects.map((p) => [p.id, p.name]));
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
        sheetOrientation: photo.printPrefs.orientation,
        rotation: 0,
      });
    }
  }

  return { pages, skippedWithoutSheet };
}
