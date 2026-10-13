import type { BookBindingId } from "@/lib/print/bookBindings";
import type { PageFit } from "@/lib/print/pageLayout";
import type { Orientation } from "@/lib/print/settings";

export type PrintRotation = 0 | 90 | 180 | 270;

export type BookWizardPhotoPage = {
  id: string;
  kind: "photo";
  sourceProjectId: string;
  sourceProjectName: string;
  photoId: string;
  /** Cloud library revision backing this page (absent for guest libraries). */
  revisionId?: string;
  title: string;
  imageDataUrl: string;
  /** Where the original color photo lives (cloud libraries), for the cover. */
  photoSource?: { storagePath: string; url: string };
  sheetOrientation: Orientation;
  rotation: PrintRotation;
  /** Mirrored left-to-right on the printed (portrait) page. */
  mirrored?: boolean;
  /** Framed inside the margin (default) or filling the page edge to edge. Set for the whole book. */
  fit?: PageFit;
};

export type BookWizardBlankPage = {
  id: string;
  kind: "blank";
  /** "lined" is a ruled writing page; anything else is an empty page. */
  variant?: "plain" | "lined";
  /**
   * Added automatically to meet the binding's page count. These come and go as
   * the book changes; pages the user inserts are never auto.
   */
  auto?: boolean;
};

export type BookWizardPage = BookWizardPhotoPage | BookWizardBlankPage;

export type BookPagePlan = {
  contentPages: BookWizardPhotoPage[];
  blankPages: BookWizardBlankPage[];
  /** Every printed page, in order, including blank and lined ones. */
  allPages: BookWizardPage[];
  totalPages: number;
  photoCount: number;
  /** All non-photo pages: auto padding plus any the user inserted. */
  blankCount: number;
  /** Blank pages added automatically to satisfy the binding. */
  paddingCount: number;
};

export type BookWizardDraft = {
  bindingId: BookBindingId;
  selectedProjectIds: string[];
  plan: BookPagePlan;
};
