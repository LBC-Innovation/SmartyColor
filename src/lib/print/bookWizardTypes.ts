import type { BookBindingId } from "@/lib/print/bookBindings";
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
  sheetOrientation: Orientation;
  rotation: PrintRotation;
};

export type BookWizardBlankPage = {
  id: string;
  kind: "blank";
};

export type BookWizardPage = BookWizardPhotoPage | BookWizardBlankPage;

export type BookPagePlan = {
  contentPages: BookWizardPhotoPage[];
  blankPages: BookWizardBlankPage[];
  allPages: BookWizardPage[];
  totalPages: number;
  photoCount: number;
  blankCount: number;
};

export type BookWizardDraft = {
  bindingId: BookBindingId;
  selectedProjectIds: string[];
  plan: BookPagePlan;
};
