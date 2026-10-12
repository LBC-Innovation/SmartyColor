import {
  PDFDocument,
  concatTransformationMatrix,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from "pdf-lib";
import {
  layoutImageOnPage,
  linedPageRules,
  paperSizePt,
  pdfDrawOptions,
  pdfMirroredMatrix,
  type PageRotation,
} from "@/lib/print/pageLayout";
import type { PrintPrefs } from "@/lib/print/settings";

/**
 * Draw one coloring sheet on a new PDF page. All placement comes from
 * `pageLayout`, the same engine the book preview uses, so every page keeps
 * the same equal margin on all sides.
 */
async function drawSheetOnPdf(
  pdf: PDFDocument,
  imageDataUrl: string,
  prefs: PrintPrefs,
  rotation: PageRotation = 0,
  mirrored = false,
) {
  const match = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
  const svgMatch = imageDataUrl.match(/^data:image\/svg\+xml/);
  if (svgMatch && !match) {
    throw new Error("Print this page in the browser for sample drawings.");
  }
  if (!match) {
    throw new Error("Could not read the drawing.");
  }

  const mime = match[1];
  const bytes = Buffer.from(match[2], "base64");
  const [width, height] = paperSizePt(prefs);
  const page = pdf.addPage([width, height]);
  const image =
    mime.includes("png")
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);

  const placement = layoutImageOnPage({
    pageWidth: width,
    pageHeight: height,
    imageWidth: image.width,
    imageHeight: image.height,
    rotationDeg: rotation,
  });
  if (mirrored) {
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...pdfMirroredMatrix(placement, height)),
    );
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: placement.drawWidth,
      height: placement.drawHeight,
    });
    page.pushOperators(popGraphicsState());
    return;
  }
  const { x, y, rotateDeg, ...size } = pdfDrawOptions(placement, height);
  page.drawImage(image, { x, y, ...size, rotate: degrees(rotateDeg) });
}

/** An empty page, or a lined writing page ruled by the shared layout engine. */
function drawBlankPage(pdf: PDFDocument, page: PdfBlankPage) {
  const [width, height] = paperSizePt(page.printPrefs);
  const pdfPage = pdf.addPage([width, height]);
  if (page.pageKind !== "lined") return;
  const { x1, x2, ys } = linedPageRules(width, height);
  for (const y of ys) {
    pdfPage.drawLine({
      start: { x: x1, y: height - y },
      end: { x: x2, y: height - y },
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
  await drawSheetOnPdf(pdf, imageDataUrl, prefs, rotation);
  return pdf.save();
}

export type PdfSheetPage = {
  imageDataUrl: string;
  printPrefs: PrintPrefs;
  rotation?: PageRotation;
  /** Mirror left-to-right on the printed page. */
  mirrored?: boolean;
};

export type PdfBlankPage = {
  pageKind: "blank" | "lined";
  printPrefs: PrintPrefs;
};

export async function sheetsToPdf(pages: Array<PdfSheetPage | PdfBlankPage>) {
  if (pages.length === 0) {
    throw new Error("Add at least one coloring sheet to the book.");
  }
  const pdf = await PDFDocument.create();
  for (const page of pages) {
    if ("pageKind" in page) {
      drawBlankPage(pdf, page);
      continue;
    }
    await drawSheetOnPdf(pdf, page.imageDataUrl, page.printPrefs, page.rotation, page.mirrored);
  }
  return pdf.save();
}
