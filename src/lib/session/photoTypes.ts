import type { PrintPrefs } from "@/lib/print/settings";

export { PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo/payloadBudget";
export const PHOTO_MAX_CORRECTIONS = 3;
export const PHOTO_MAX_CORRECTION_CHARS = 200;

/** Pixel size measured on the client at upload; a hint when the server can't read the bytes. */
export type PhotoImageSizeHint = { width: number; height: number };

export type PhotoColoringGenerateRequest = {
  photoDataUrl: string;
  printPrefs: PrintPrefs;
  image?: PhotoImageSizeHint;
};

export type PhotoColoringCorrectRequest = {
  photoDataUrl: string;
  image?: PhotoImageSizeHint;
  sheetDataUrl: string;
  corrections: string[];
  printPrefs: PrintPrefs;
};
