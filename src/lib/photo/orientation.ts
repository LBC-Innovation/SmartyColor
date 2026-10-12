import type { Orientation, PrintPrefs } from "@/lib/print/settings";

export type PhotoLayout = {
  orientation: Orientation;
  /** Gemini `imageConfig.aspectRatio` value */
  aspectRatio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
  width: number;
  height: number;
};

export function inferPhotoLayout(width: number, height: number): PhotoLayout {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const ratio = w / h;

  if (ratio >= 1.45) {
    return { orientation: "landscape", aspectRatio: "16:9", width: w, height: h };
  }
  if (ratio >= 1.05) {
    return { orientation: "landscape", aspectRatio: "4:3", width: w, height: h };
  }
  if (ratio <= 1 / 1.45) {
    return { orientation: "portrait", aspectRatio: "9:16", width: w, height: h };
  }
  if (ratio <= 1 / 1.05) {
    return { orientation: "portrait", aspectRatio: "3:4", width: w, height: h };
  }
  return { orientation: "portrait", aspectRatio: "1:1", width: w, height: h };
}

/** Width ÷ height implied by a layout's Gemini aspect ratio, e.g. "3:4" → 0.75. */
export function layoutRatio(layout: PhotoLayout): number {
  const [w, h] = layout.aspectRatio.split(":").map(Number);
  return w / h;
}

/**
 * Pixel size as a viewer sees it. EXIF orientations 5–8 mean the stored pixels
 * are rotated a quarter turn, so width and height swap; a raw read of
 * `sharp().metadata()` would report landscape for an upright phone portrait.
 */
export function displayedSize(
  width: number,
  height: number,
  exifOrientation?: number,
): { width: number; height: number } {
  return exifOrientation && exifOrientation >= 5 && exifOrientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

/**
 * True when a generated sheet is turned the wrong way for the photo (a
 * landscape image for a portrait photo, or the reverse). Near-square layouts
 * accept either, and so does a near-square result.
 */
export function sheetOrientationMismatch(
  layout: PhotoLayout,
  sheetWidth: number,
  sheetHeight: number,
): boolean {
  if (layout.aspectRatio === "1:1") return false;
  const ratio = sheetWidth / Math.max(1, sheetHeight);
  if (ratio < 1.05 && ratio > 1 / 1.05) return false;
  return layout.orientation === "landscape" ? ratio < 1 : ratio > 1;
}

export function printPrefsForPhoto(
  printPrefs: PrintPrefs,
  layout: PhotoLayout,
): PrintPrefs {
  return { ...printPrefs, orientation: layout.orientation };
}

/** Appended to a retry when the first sheet came back turned the wrong way. */
export function photoLayoutRetryNote(layout: PhotoLayout) {
  const shape = layout.orientation === "landscape" ? "LANDSCAPE" : "PORTRAIT";
  const tall =
    layout.orientation === "landscape"
      ? "wider than it is tall"
      : "taller than it is wide";
  return `CORRECTION: the previous attempt was drawn in the wrong orientation. The photo is ${shape}. Draw the whole scene again on a ${shape} canvas (${layout.aspectRatio}) that is ${tall}. Do not rotate the photo, do not turn the scene on its side, and do not leave the canvas square or the opposite orientation.`;
}

export function photoLayoutPromptBlock(layout: PhotoLayout) {
  const shape =
    layout.orientation === "landscape"
      ? "LANDSCAPE (wider than tall)"
      : "PORTRAIT (taller than wide)";
  return `CANVAS LAYOUT (mandatory — overrides Printer Settings orientation):
- The reference photo is ${shape}, aspect about ${layout.aspectRatio} (${layout.width}×${layout.height} px).
- The output image MUST be ${shape} too, at ${layout.aspectRatio}. Match the photo's orientation exactly, whatever the Printer Settings say.
- Draw the COMPLETE wide shot — every person and major object from the photo, edge to edge. Do NOT zoom in, crop, or reframe on one face.
- Output MUST stay the same orientation as the photo — never rotate a horizontal photo to vertical.
- Keep the same left-to-right composition, headroom, and ground space as the reference.
- Leave open sky/ground areas mostly empty white — do NOT fill them with random lines, hatching, or texture.
- A thick page border is drawn on the outer edge after generation — keep critical details slightly away from the very edge if possible.`;
}
