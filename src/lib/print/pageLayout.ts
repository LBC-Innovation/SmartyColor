/**
 * The single source of truth for how a coloring sheet sits on a printed page.
 *
 * Every surface that renders a page — the PDF download, the Print button, the
 * book-order preview, and the book PDF itself — goes through this module, so
 * the margin and the fit can never drift apart between them. It is pure math
 * (no pdf-lib, no DOM) so the server and the browser share it.
 *
 * Coordinates are in PDF points (1/72″) with the origin at the TOP-LEFT of the
 * page; callers flip y themselves when drawing into pdf-lib.
 */

/** Space kept clear between every page edge and the artwork, on all four sides. */
export const PRINT_MARGIN_IN = 0.5;
export const POINTS_PER_INCH = 72;
export const PRINT_MARGIN_PT = PRINT_MARGIN_IN * POINTS_PER_INCH;

/** US letter portrait trim (8.5×11″), the book-order page. */
export const BOOK_TRIM_WIDTH_IN = 8.5;
export const BOOK_TRIM_HEIGHT_IN = 11;

/** Page size in points for the chosen paper and orientation. */
export function paperSizePt(prefs: {
  paper: "letter" | "a4";
  orientation: "portrait" | "landscape";
}): [number, number] {
  const [w, h]: [number, number] =
    prefs.paper === "a4" ? [595.28, 841.89] : [612, 792];
  return prefs.orientation === "landscape" ? [h, w] : [w, h];
}

export type PageRotation = 0 | 90 | 180 | 270;

export type LayoutBox = { x: number; y: number; width: number; height: number };

export type ImagePlacement = {
  /** Centre of the drawn image, in page points from the top-left. */
  centerX: number;
  centerY: number;
  /** Page points per source-image pixel (uniform: never squished). */
  scale: number;
  /** Drawn size before rotation, in page points. */
  drawWidth: number;
  drawHeight: number;
  /** Clockwise rotation in degrees. */
  rotationDeg: PageRotation;
  /** The area the image was fitted into. */
  box: LayoutBox;
};

/** The artwork area of a page: the page inset by the print margin on every side. */
export function printableBox(
  pageWidth: number,
  pageHeight: number,
  margin: number = PRINT_MARGIN_PT,
): LayoutBox {
  // Never let a tiny page collapse to nothing.
  const m = Math.min(margin, pageWidth / 4, pageHeight / 4);
  return { x: m, y: m, width: pageWidth - m * 2, height: pageHeight - m * 2 };
}

/**
 * Uniform scale so the whole image fits a box after rotation (no clip, no squish).
 */
export function containScale(input: {
  boxWidth: number;
  boxHeight: number;
  imageWidth: number;
  imageHeight: number;
  rotationDeg?: number;
}): number {
  const { boxWidth: bw, boxHeight: bh, imageWidth: iw, imageHeight: ih } = input;
  if (bw <= 0 || bh <= 0 || iw <= 0 || ih <= 0) return 1;
  const rotation = input.rotationDeg ?? 0;
  const quarter = rotation === 90 || rotation === 270;
  return quarter ? Math.min(bw / ih, bh / iw) : Math.min(bw / iw, bh / ih);
}

/** Fit an image inside a box, centred (or bottom-aligned when `valign` says so). */
export function placeImageInBox(input: {
  box: LayoutBox;
  imageWidth: number;
  imageHeight: number;
  rotationDeg?: PageRotation;
  valign?: "center" | "bottom";
}): ImagePlacement {
  const { box, imageWidth, imageHeight } = input;
  const rotationDeg = input.rotationDeg ?? 0;
  const scale = containScale({
    boxWidth: box.width,
    boxHeight: box.height,
    imageWidth,
    imageHeight,
    rotationDeg,
  });
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const quarter = rotationDeg === 90 || rotationDeg === 270;
  const visualHeight = quarter ? drawWidth : drawHeight;
  const centerX = box.x + box.width / 2;
  const centerY =
    input.valign === "bottom"
      ? box.y + box.height - visualHeight / 2
      : box.y + box.height / 2;
  return { centerX, centerY, scale, drawWidth, drawHeight, rotationDeg, box };
}

/** Fit a whole-page image inside the page's printable area. */
export function layoutImageOnPage(input: {
  pageWidth: number;
  pageHeight: number;
  imageWidth: number;
  imageHeight: number;
  rotationDeg?: PageRotation;
  margin?: number;
}): ImagePlacement {
  return placeImageInBox({
    box: printableBox(input.pageWidth, input.pageHeight, input.margin),
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    rotationDeg: input.rotationDeg,
  });
}

/**
 * pdf-lib `drawImage` options for a placement. pdf-lib rotates counter-clockwise
 * about the image's bottom-left corner, so the corner is solved for here.
 */
export function pdfDrawOptions(placement: ImagePlacement, pageHeight: number) {
  const { centerX, drawWidth: w, drawHeight: h, rotationDeg } = placement;
  const centerY = pageHeight - placement.centerY;
  const theta = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: centerX + (-w / 2) * cos - (-h / 2) * sin,
    y: centerY + (-w / 2) * sin + (-h / 2) * cos,
    width: w,
    height: h,
    /** Counter-clockwise degrees, as pdf-lib expects. */
    rotateDeg: -rotationDeg,
  };
}

/**
 * Transformation matrix `[a b c d e f]` that draws a unit-sized image box
 * (x 0..width, y 0..height) at its placement, rotated, then mirrored
 * left-to-right about the image's own vertical centre line on the page.
 * pdf-lib's `drawImage` can't mirror, so the PDF builder applies this
 * to the graphics state instead.
 */
export function pdfMirroredMatrix(
  placement: ImagePlacement,
  pageHeight: number,
): [number, number, number, number, number, number] {
  const { centerX, drawWidth: w, drawHeight: h, rotationDeg } = placement;
  const centerY = pageHeight - placement.centerY;
  const theta = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // translate(center) · mirrorX · rotate(theta) · translate(-w/2, -h/2)
  return [
    -cos,
    sin,
    sin,
    cos,
    centerX + (cos * w) / 2 - (sin * h) / 2,
    centerY - (sin * w) / 2 - (cos * h) / 2,
  ];
}

/** Wide-ruled notebook paper: 11/32″ between rules. */
export const LINED_RULE_SPACING_IN = 11 / 32;
/** Header space above the first rule, measured from the top of the page. */
export const LINED_FIRST_RULE_IN = 1;

/**
 * Rules of a lined writing page, in page points from the top-left. Rules run
 * between the print margins, from the header space down to the bottom margin.
 */
export function linedPageRules(pageWidth: number, pageHeight: number) {
  const box = printableBox(pageWidth, pageHeight);
  const spacing = LINED_RULE_SPACING_IN * POINTS_PER_INCH;
  const bottom = box.y + box.height;
  const ys: number[] = [];
  for (
    let y = Math.max(box.y, LINED_FIRST_RULE_IN * POINTS_PER_INCH);
    y <= bottom + 0.01;
    y += spacing
  ) {
    ys.push(y);
  }
  return { x1: box.x, x2: box.x + box.width, ys };
}
