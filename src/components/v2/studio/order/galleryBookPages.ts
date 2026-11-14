import { bookPageId } from "@/components/v2/studio/order/useBookOrder";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import type { PrintPrefs } from "@/lib/print/settings";
import type { SheetVersion } from "@/lib/session/types";
import {
  activeSheetVersion,
  normalizeV2SheetRevisions,
  photoOrientation,
  type V2PhotoEntry,
} from "@/lib/v2/studioTypes";

export type GalleryBook = {
  /** Book pages in gallery order: photos with a coloring page that aren't left out. */
  pages: BookWizardPhotoPage[];
  /** Photo id → its position among the book's pages (1-based), before any gift note. */
  positionByPhotoId: Map<string, number>;
  /** Photos still being drawn (or edited); they join the book when ready. */
  stillDrawing: number;
  /** Photos with no coloring page yet (not drawing, not left out). */
  withoutPage: number;
  leftOut: number;
};

/**
 * The coloring page a photo shows: the chosen page, or (when the chosen version is a reframed
 * photo, e.g. while a page is being drawn from it) its newest page. Reframed photos are steps on
 * the way to a page, never something to show in place of one, so a photo with pages always shows
 * one of them.
 */
export function activePageVersion(photo: V2PhotoEntry): SheetVersion | null {
  const revisions = normalizeV2SheetRevisions(photo);
  const version = activeSheetVersion({ ...photo, sheetRevisions: revisions });
  if (version && version.kind !== "photo") return version;
  return [...revisions].reverse().find((r) => r.kind !== "photo") ?? null;
}

/** Every coloring page of a photo, oldest first; reframed photos are left out. */
export function pageVersions(photo: V2PhotoEntry): SheetVersion[] {
  return normalizeV2SheetRevisions(photo).filter((r) => r.kind !== "photo");
}

/**
 * The one photo behind what is showing: the reframed photo the shown page was drawn from, or the
 * reframed photo itself while its page is still to come, else null for the uploaded photo.
 */
export function pageSourceVersion(photo: V2PhotoEntry): SheetVersion | null {
  const revisions = normalizeV2SheetRevisions(photo);
  const page = activePageVersion(photo);
  if (page) {
    if (!page.sourceRevisionId) return null;
    return revisions.find((r) => r.id === page.sourceRevisionId && r.kind === "photo") ?? null;
  }
  // No page yet: a reframed photo that is chosen is the one its first page will be drawn from.
  const active = activeSheetVersion({ ...photo, sheetRevisions: revisions });
  return active?.kind === "photo" ? active : null;
}

/** Print settings for the shown page, with that page's own shape. */
export function pagePrintPrefs(photo: V2PhotoEntry): PrintPrefs {
  const page = activePageVersion(photo);
  return { ...photo.printPrefs, orientation: page?.orientation ?? pageSourceVersion(photo)?.orientation ?? photoOrientation(photo) };
}

/** The gallery is the book: its order is the page order, and there is no second ordering. */
export function galleryBook(photos: V2PhotoEntry[], projectId: string | null, projectName: string): GalleryBook {
  const pages: BookWizardPhotoPage[] = [];
  const positionByPhotoId = new Map<string, number>();
  let stillDrawing = 0;
  let withoutPage = 0;
  let leftOut = 0;
  const album = projectId ?? "album";
  for (const photo of photos) {
    if (photo.printPrefs.book?.leftOut) {
      leftOut += 1;
      continue;
    }
    const version = activePageVersion(photo);
    if (!version) {
      if (photo.generating) stillDrawing += 1;
      else withoutPage += 1;
      continue;
    }
    if (photo.correcting) stillDrawing += 1;
    const libraryPhotoId = photo.remote?.photoId ?? photo.id;
    pages.push({
      id: bookPageId(album, libraryPhotoId),
      kind: "photo",
      sourceProjectId: album,
      sourceProjectName: projectName,
      photoId: libraryPhotoId,
      ...(photo.remote ? { revisionId: version.id } : {}),
      title: version.sheet.title,
      imageDataUrl: version.sheet.imageDataUrl,
      ...(photo.remote ? { photoSource: { storagePath: photo.remote.storagePath, url: photo.previewUrl } } : {}),
      sheetOrientation: version.orientation ?? photoOrientation(photo),
      rotation: 0,
      // Framed or edge to edge is one choice for the whole book, made in the order panel.
      fit: "framed" as const,
    });
    positionByPhotoId.set(photo.id, pages.length);
  }
  return { pages, positionByPhotoId, stillDrawing, withoutPage, leftOut };
}
