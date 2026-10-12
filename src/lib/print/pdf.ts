import { PDFDocument, degrees } from "pdf-lib";
import {
  layoutImageOnPage,
  paperSizePt,
  pdfDrawOptions,
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
  const { x, y, rotateDeg, ...size } = pdfDrawOptions(placement, height);
  page.drawImage(image, { x, y, ...size, rotate: degrees(rotateDeg) });
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
};

export async function sheetsToPdf(pages: PdfSheetPage[]) {
  if (pages.length === 0) {
    throw new Error("Add at least one coloring sheet to the book.");
  }
  const pdf = await PDFDocument.create();
  for (const page of pages) {
    await drawSheetOnPdf(pdf, page.imageDataUrl, page.printPrefs, page.rotation);
  }
  return pdf.save();
}
