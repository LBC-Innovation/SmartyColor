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

/**
 * How a coloring sheet sits on its page. "framed" shows the whole picture
 * inside the margin; "full" scales it to fill the page edge to edge, cropping
 * whatever overflows.
 */
export type PageFit = "framed" | "full";

/** A printed book page that runs to the edge is printed this much oversize, then trimmed. */
export const BOOK_BLEED_IN = 0.125;

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

/** Uniform scale so the image covers a box after rotation (no gaps; the overflow is cropped). */
export function coverScale(input: {
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
  return quarter ? Math.max(bw / ih, bh / iw) : Math.max(bw / iw, bh / ih);
}

/**
 * The area an edge-to-edge sheet fills, in trim-page coordinates: the page
 * plus the bleed that is printed and cut away (zero for a print-at-home page).
 */
export function fullBleedBox(pageWidth: number, pageHeight: number, bleed: number): LayoutBox {
  return { x: -bleed, y: -bleed, width: pageWidth + bleed * 2, height: pageHeight + bleed * 2 };
}

/** Fit an image inside a box, centred (or bottom-aligned when `valign` says so), or fill it. */
export function placeImageInBox(input: {
  box: LayoutBox;
  imageWidth: number;
  imageHeight: number;
  rotationDeg?: PageRotation;
  valign?: "center" | "bottom";
  /** "cover" fills the box and crops the overflow; the default shows the whole image. */
  fit?: "contain" | "cover";
}): ImagePlacement {
  const { box, imageWidth, imageHeight } = input;
  const rotationDeg = input.rotationDeg ?? 0;
  const scale = (input.fit === "cover" ? coverScale : containScale)({
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

/**
 * Extra inside margin Lulu recommends on the spine side of a glued paperback,
 * where part of the page disappears into the binding. Coil bound and saddle
 * stitch books open flat and need none.
 */
export function bookGutterIn(bindingId: string, pageCount: number): number {
  if (bindingId !== "perfect_bound" || pageCount <= 60) return 0;
  if (pageCount <= 150) return 0.125;
  if (pageCount <= 400) return 0.5;
  if (pageCount <= 600) return 0.625;
  return 0.75;
}

/**
 * The artwork area of a book page: the printable box, narrowed by the gutter on
 * the spine side. Page 1 is a right-hand page, so odd pages have the spine on
 * their left and even pages on their right.
 */
export function bookPageBox(
  pageWidth: number,
  pageHeight: number,
  pageNumber: number,
  gutter: number,
): LayoutBox {
  const box = printableBox(pageWidth, pageHeight);
  const g = Math.max(0, Math.min(gutter, box.width / 2));
  if (g === 0) return box;
  return pageNumber % 2 === 1
    ? { ...box, x: box.x + g, width: box.width - g }
    : { ...box, width: box.width - g };
}

/** Fit a whole-page image inside the page's printable area. */
export function layoutImageOnPage(input: {
  pageWidth: number;
  pageHeight: number;
  imageWidth: number;
  imageHeight: number;
  rotationDeg?: PageRotation;
  margin?: number;
  /** Fit into this area instead of the default printable box (book pages with a gutter). */
  box?: LayoutBox;
  fit?: "contain" | "cover";
}): ImagePlacement {
  return placeImageInBox({
    box: input.box ?? printableBox(input.pageWidth, input.pageHeight, input.margin),
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    rotationDeg: input.rotationDeg,
    fit: input.fit,
  });
}

/** Resolution a printed book's pages are sent to the printer at (Lulu asks for 300 PPI). */
export const BOOK_PRINT_PPI = 300;
/**
 * A sheet with fewer of its own pixels per printed inch than this has to be
 * enlarged so far that its lines print visibly soft, however it is resampled.
 */
export const BOOK_MIN_SHEET_PPI = 150;

/**
 * Pixels per printed inch a sheet of this size has once it is laid out on a
 * book page. Edge-to-edge pages enlarge the sheet more than framed ones, and a
 * sheet whose shape doesn't match the page is enlarged most of all.
 */
export function bookSheetPpi(input: {
  imageWidth: number;
  imageHeight: number;
  rotationDeg?: PageRotation;
  fit?: PageFit;
  gutterIn?: number;
  bleedIn?: number;
}): number {
  const pageWidth = BOOK_TRIM_WIDTH_IN * POINTS_PER_INCH;
  const pageHeight = BOOK_TRIM_HEIGHT_IN * POINTS_PER_INCH;
  const full = input.fit === "full";
  const placement = layoutImageOnPage({
    pageWidth,
    pageHeight,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    rotationDeg: input.rotationDeg,
    box: full
      ? fullBleedBox(pageWidth, pageHeight, (input.bleedIn ?? 0) * POINTS_PER_INCH)
      : bookPageBox(pageWidth, pageHeight, 1, (input.gutterIn ?? 0) * POINTS_PER_INCH),
    fit: full ? "cover" : "contain",
  });
  return POINTS_PER_INCH / placement.scale;
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
export function linedPageRules(
  pageWidth: number,
  pageHeight: number,
  box: LayoutBox = printableBox(pageWidth, pageHeight),
) {
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
