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

/** Sent back when a photo that is already upright is offered for a portrait version. */
export const PHOTO_NOT_LANDSCAPE_MESSAGE = "This photo is already portrait.";

/** Title of an AI portrait version in a photo's version rail. */
export const PORTRAIT_VERSION_TITLE = "Portrait photo";

export type PhotoPortraitRequest = {
  photoDataUrl: string;
  image?: PhotoImageSizeHint;
};

/** A photo the image model produced (not a coloring sheet). */
export type GeneratedPhoto = {
  imageDataUrl: string;
  mimeType: string;
  width: number;
  height: number;
};

export type PhotoColoringCorrectRequest = {
  photoDataUrl: string;
  image?: PhotoImageSizeHint;
  sheetDataUrl: string;
  corrections: string[];
  printPrefs: PrintPrefs;
};
