import {
  SHEET_ASPECT,
  SHEET_PRINT_LONG_EDGE_PX,
  SHEET_PRINT_SHORT_EDGE_PX,
} from "@/lib/print/pageLayout";
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

/**
 * The canvas every generated sheet and reframed photo is drawn on: a US Letter page
 * (3:4 portrait or 4:3 landscape) at print resolution. Whatever shape the photo is,
 * the output is always this shape, so it sits on an 8.5×11″ page with no stretching.
 */
export function letterCanvas(orientation: Orientation): PhotoLayout {
  return orientation === "landscape"
    ? {
        orientation,
        aspectRatio: SHEET_ASPECT.landscape,
        width: SHEET_PRINT_LONG_EDGE_PX,
        height: SHEET_PRINT_SHORT_EDGE_PX,
      }
    : {
        orientation,
        aspectRatio: SHEET_ASPECT.portrait,
        width: SHEET_PRINT_SHORT_EDGE_PX,
        height: SHEET_PRINT_LONG_EDGE_PX,
      };
}

/** The letter canvas a photo is drawn on: landscape photos lie on their side, the rest stand up. */
export function letterCanvasFor(source: PhotoLayout): PhotoLayout {
  return letterCanvas(source.orientation);
}

/**
 * Prompt header shared by every sheet and reframe: what page the image is for, its exact
 * shape and size, and what that means for composition and line weight.
 */
export function printPagePromptBlock(
  canvas: PhotoLayout,
  kind: "lineArt" | "edit" | "photo" = "lineArt",
) {
  const landscape = canvas.orientation === "landscape";
  const page = landscape ? "11 × 8.5 in (US Letter on its side)" : "8.5 × 11 in (US Letter)";
  const shape = landscape ? "LANDSCAPE (wider than tall)" : "PORTRAIT (taller than wide)";
  const lines = [
    `PRINT PAGE (mandatory — this image is printed in a book):`,
    `- Page: ${page} at 300 pixels per inch. The canvas is ${shape}, exactly ${canvas.aspectRatio} — the shape of that page. Fill the whole canvas: no letterboxing, empty bands, or picture-in-a-box.`,
    `- Keep faces, hands, and important details at least 5% in from each edge (edges are trimmed, and sheets get a border).`,
    `- Crisp edges that stay sharp when enlarged — no blur or artifacts. Sharpness only: do not add lines or texture to look "high resolution".`,
  ];
  if (kind === "lineArt") {
    lines.push(
      `- Line weight as the style rules in this prompt say: never hairline-thin (it vanishes on paper), never bold marker. Every enclosed area must be big enough to color with a crayon.`,
    );
  }
  return lines.join("\n");
}

/** Appended to a retry when the first sheet came back turned the wrong way. */
export function photoLayoutRetryNote(canvas: PhotoLayout) {
  const shape = canvas.orientation === "landscape" ? "LANDSCAPE" : "PORTRAIT";
  const tall =
    canvas.orientation === "landscape"
      ? "wider than it is tall"
      : "taller than it is wide";
  return `CORRECTION: the previous attempt was drawn in the wrong orientation. The page is ${shape}. Draw the whole scene again on a ${shape} canvas (${canvas.aspectRatio}) that is ${tall}. Do not rotate the photo, do not turn the scene on its side, and do not leave the canvas square or the opposite orientation.`;
}

/**
 * Canvas instructions for a photo sheet: the photo's own shape, the letter page it is drawn
 * onto, and how to bridge the two when they differ (e.g. a 16:9 photo on a 4:3 page) without
 * inventing anything. "edit" keeps the current sheet's drawing as it is.
 */
export function photoLayoutPromptBlock(
  source: PhotoLayout,
  canvas: PhotoLayout = letterCanvasFor(source),
  mode: "trace" | "edit" = "trace",
) {
  const sourceShape =
    source.orientation === "landscape"
      ? "LANDSCAPE (wider than tall)"
      : source.aspectRatio === "1:1"
        ? "SQUARE"
        : "PORTRAIT (taller than wide)";
  const canvasShape =
    canvas.orientation === "landscape"
      ? "LANDSCAPE (wider than tall)"
      : "PORTRAIT (taller than wide)";
  const sameShape = source.aspectRatio === canvas.aspectRatio;
  const wider = layoutRatio(source) > layoutRatio(canvas);
  const extra = wider ? "above and below" : "to the left and right";
  const fit =
    mode === "edit"
      ? `- If the CURRENT sheet is not this shape, keep its drawing exactly as it is and fill the extra space ${extra} with plain white, or only continue a line that already runs off its edge (a floor, horizon, or wall). Do not redraw, rescale unevenly, or rearrange the drawing.`
      : sameShape
        ? `- The photo already has the page's shape: keep its framing exactly.`
        : `- The photo is ${wider ? "wider" : "narrower"} than the page. Fit the WHOLE photo onto the page — every person and key object, nothing cropped, nothing stretched or squashed. In the extra space ${extra}, only continue what is already visible at the photo's edges (sky, wall, floor, grass) with a few long, simple lines, or leave it plain white. Never invent people, objects, or scenery to fill it.`;
  const lines = [
    printPagePromptBlock(canvas, mode === "edit" ? "edit" : "lineArt"),
    "",
    `CANVAS LAYOUT (mandatory — overrides Printer Settings orientation):`,
    `- The reference photo is ${sourceShape}, about ${source.aspectRatio}. The output MUST be ${canvasShape} at ${canvas.aspectRatio}; never rotate the scene on its side.`,
    fit,
  ];
  if (mode === "trace") {
    lines.push(
      `- Draw the COMPLETE shot — every person and major object, with the same left-to-right composition, headroom, and ground space. Do NOT zoom in or reframe on one face.`,
      `- Leave open sky/ground areas mostly empty white — no random lines, hatching, or texture.`,
    );
  }
  return lines.join("\n");
}
