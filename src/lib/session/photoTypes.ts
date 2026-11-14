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

/** Sent back when a photo that is already wide is offered for a landscape version. */
export const PHOTO_NOT_PORTRAIT_MESSAGE = "This photo is already landscape.";

/** Title of an AI portrait version in a photo's version rail. */
export const PORTRAIT_VERSION_TITLE = "Portrait photo";
/** Title of an AI landscape version in a photo's version rail. */
export const LANDSCAPE_VERSION_TITLE = "Landscape photo";

/** Which way a photo is reframed to. */
export type ReframeTarget = "portrait" | "landscape";

export function reframeVersionTitle(target: ReframeTarget): string {
  return target === "landscape" ? LANDSCAPE_VERSION_TITLE : PORTRAIT_VERSION_TITLE;
}

/** The refusal for a photo that is already the shape asked for. */
export function alreadyOrientedMessage(target: ReframeTarget): string {
  return target === "landscape" ? PHOTO_NOT_PORTRAIT_MESSAGE : PHOTO_NOT_LANDSCAPE_MESSAGE;
}

export type PhotoPortraitRequest = {
  photoDataUrl: string;
  image?: PhotoImageSizeHint;
  /** The shape to reframe to; portrait when left out. */
  target?: ReframeTarget;
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
