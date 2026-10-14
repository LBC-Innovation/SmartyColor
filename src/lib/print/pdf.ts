import {
  PDFDocument,
  type PDFPage,
  type PDFRef,
  type Rotation,
  concatTransformationMatrix,
  degrees,
  drawImage as drawImageOperators,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from "pdf-lib";
import {
  POINTS_PER_INCH,
  bookPageBox,
  fullBleedBox,
  layoutImageOnPage,
  linedPageRules,
  paperSizePt,
  pdfDrawOptions,
  pdfMirroredMatrix,
  type LayoutBox,
  type PageFit,
  type PageRotation,
} from "@/lib/print/pageLayout";
import type { PrintPrefs } from "@/lib/print/settings";

/**
 * A grayscale picture already compressed for the PDF: rows of `bitsPerComponent`
 * samples (0 black … max white), each row starting on a byte, Flate-deflated.
 * Line art kept this way is a fraction of the size of the same page as a JPEG.
 */
export type PdfGrayImage = {
  width: number;
  height: number;
  bitsPerComponent: 4 | 8;
  deflated: Uint8Array;
};

/** A sheet picture: a data URL (PNG or JPEG), or grayscale samples ready for the PDF. */
export type PdfSheetImage = string | PdfGrayImage;

/** An image placed in the PDF: where it lives, and its size in pixels. */
type EmbeddedImage = { ref: PDFRef; width: number; height: number };

/**
 * Put a ready-made DeviceGray image straight into the PDF, no re-encoding.
 * pdf-lib only embeds JPEG and PNG, so this registers the image stream itself.
 */
function embedGrayImage(pdf: PDFDocument, gray: PdfGrayImage): EmbeddedImage {
  const stream = pdf.context.stream(gray.deflated, {
    Type: "XObject",
    Subtype: "Image",
    Width: gray.width,
    Height: gray.height,
    ColorSpace: "DeviceGray",
    BitsPerComponent: gray.bitsPerComponent,
    Filter: "FlateDecode",
  });
  return { ref: pdf.context.register(stream), width: gray.width, height: gray.height };
}

async function embedSheetImage(pdf: PDFDocument, source: PdfSheetImage): Promise<EmbeddedImage> {
  if (typeof source !== "string") return embedGrayImage(pdf, source);
  const match = source.match(/^data:(.+);base64,(.+)$/);
  if (source.startsWith("data:image/svg+xml") && !match) {
    throw new Error("Print this page in the browser for sample drawings.");
  }
  if (!match) {
    throw new Error("Could not read the drawing.");
  }
  const bytes = Buffer.from(match[2], "base64");
  return match[1].includes("png") ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

/** `page.drawImage` for any embedded image, including ones pdf-lib didn't embed itself. */
function drawEmbeddedImage(
  page: PDFPage,
  image: EmbeddedImage,
  at: { x: number; y: number; width: number; height: number; rotate?: Rotation },
) {
  const name = page.node.newXObject("Image", image.ref);
  page.pushOperators(
    ...drawImageOperators(name, { ...at, rotate: at.rotate ?? degrees(0), xSkew: degrees(0), ySkew: degrees(0) }),
  );
}

type SheetDrawOptions = {
  rotation?: PageRotation;
  mirrored?: boolean;
  /** Framed pages: fit into this area instead of the default printable box. */
  box?: LayoutBox;
  /** "full" scales the sheet to fill the page (and its bleed), cropping the overflow. */
  fit?: PageFit;
  /** Extra paper on every side that the printer trims away, in points. */
  bleed?: number;
};

/**
 * Draw one coloring sheet on a new PDF page. All placement comes from
 * `pageLayout`, the same engine the book preview uses, so every framed page
 * keeps the same equal margin on all sides. Placement is worked out on the
 * trimmed page and then shifted by the bleed, so a page with bleed and one
 * without lay out identically once cut.
 */
async function drawSheetOnPdf(
  pdf: PDFDocument,
  source: PdfSheetImage,
  prefs: PrintPrefs,
  options: SheetDrawOptions = {},
) {
  const image = await embedSheetImage(pdf, source);
  const [width, height] = paperSizePt(prefs);
  const bleed = options.bleed ?? 0;
  const pageHeight = height + bleed * 2;
  const page = pdf.addPage([width + bleed * 2, pageHeight]);

  const full = options.fit === "full";
  const onTrim = layoutImageOnPage({
    pageWidth: width,
    pageHeight: height,
    imageWidth: image.width,
    imageHeight: image.height,
    rotationDeg: options.rotation ?? 0,
    box: full ? fullBleedBox(width, height, bleed) : options.box,
    fit: full ? "cover" : "contain",
  });
  const placement = { ...onTrim, centerX: onTrim.centerX + bleed, centerY: onTrim.centerY + bleed };
  if (options.mirrored) {
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...pdfMirroredMatrix(placement, pageHeight)),
    );
    drawEmbeddedImage(page, image, {
      x: 0,
      y: 0,
      width: placement.drawWidth,
      height: placement.drawHeight,
    });
    page.pushOperators(popGraphicsState());
    return;
  }
  const { x, y, rotateDeg, ...size } = pdfDrawOptions(placement, pageHeight);
  drawEmbeddedImage(page, image, { x, y, ...size, rotate: degrees(rotateDeg) });
}

/** An empty page, or a lined writing page ruled by the shared layout engine. */
function drawBlankPage(pdf: PDFDocument, page: PdfBlankPage, box?: LayoutBox, bleed = 0) {
  const [width, height] = paperSizePt(page.printPrefs);
  const pageHeight = height + bleed * 2;
  const pdfPage = pdf.addPage([width + bleed * 2, pageHeight]);
  if (page.pageKind !== "lined") return;
  const { x1, x2, ys } = linedPageRules(width, height, box);
  for (const y of ys) {
    pdfPage.drawLine({
      start: { x: x1 + bleed, y: pageHeight - (y + bleed) },
      end: { x: x2 + bleed, y: pageHeight - (y + bleed) },
      thickness: 0.6,
      color: rgb(0.6, 0.6, 0.6),
    });
  }
}

export async function sheetToPdf(
  imageDataUrl: string,
  prefs: PrintPrefs,
  rotation: PageRotation = 0,
) {
  const pdf = await PDFDocument.create();
  await drawSheetOnPdf(pdf, imageDataUrl, prefs, { rotation });
  return pdf.save();
}

export type PdfSheetPage = {
  image: PdfSheetImage;
  printPrefs: PrintPrefs;
  rotation?: PageRotation;
  /** Mirror left-to-right on the printed page. */
  mirrored?: boolean;
  /** "full" fills the page edge to edge; the default frames the sheet inside the margin. */
  fit?: PageFit;
};

export type PdfBlankPage = {
  pageKind: "blank" | "lined";
  printPrefs: PrintPrefs;
};

export async function sheetsToPdf(
  pages: Array<PdfSheetPage | PdfBlankPage>,
  options: {
    /** Bound books: extra inside margin (inches) on the spine side of every framed page. */
    gutterIn?: number;
    /** Printed books that run to the edge: every page gets this much trim-off paper (inches) on all sides. */
    bleedIn?: number;
  } = {},
) {
  if (pages.length === 0) {
    throw new Error("Add at least one coloring sheet to the book.");
  }
  const gutter = (options.gutterIn ?? 0) * POINTS_PER_INCH;
  const bleed = (options.bleedIn ?? 0) * POINTS_PER_INCH;
  const pdf = await PDFDocument.create();
  for (const [index, page] of pages.entries()) {
    const box = gutter > 0 ? bookPageBox(...paperSizePt(page.printPrefs), index + 1, gutter) : undefined;
    if ("pageKind" in page) {
      drawBlankPage(pdf, page, box, bleed);
      continue;
    }
    await drawSheetOnPdf(pdf, page.image, page.printPrefs, {
      rotation: page.rotation,
      mirrored: page.mirrored,
      box,
      fit: page.fit,
      bleed,
    });
  }
  return pdf.save();
}
