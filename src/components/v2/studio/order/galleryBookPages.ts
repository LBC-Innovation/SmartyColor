import { bookPageId } from "@/components/v2/studio/order/useBookOrder";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
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

/** The active version of a photo when it is a coloring page (not a portrait photo version). */
export function activePageVersion(photo: V2PhotoEntry) {
  const version = activeSheetVersion({ ...photo, sheetRevisions: normalizeV2SheetRevisions(photo) });
  return version && version.kind !== "photo" ? version : null;
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
    if (!version || !photo.sheet) {
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
