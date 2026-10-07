import type { PrintPrefs } from "@/lib/print/settings";

export { PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo/payloadBudget";
export const PHOTO_MAX_CORRECTIONS = 3;
export const PHOTO_MAX_CORRECTION_CHARS = 200;

export type PhotoColoringGenerateRequest = {
  photoDataUrl: string;
  printPrefs: PrintPrefs;
};

export type PhotoColoringCorrectRequest = {
  photoDataUrl: string;
  sheetDataUrl: string;
  corrections: string[];
  printPrefs: PrintPrefs;
};
