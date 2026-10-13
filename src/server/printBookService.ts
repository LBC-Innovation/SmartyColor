import "server-only";
import sharp from "sharp";
import type { ApiResult } from "@/lib/api/types";
import type { DigitalBookPage } from "@/lib/orders/types";
import { getBookBinding, type BookBindingId } from "@/lib/print/bookBindings";
import {
  COVER_FRONT_HEIGHT_IN,
  COVER_FRONT_WIDTH_IN,
  COVER_PRINT_PPI,
  type BookCoverDesign,
} from "@/lib/print/bookCover";
import { buildCoverPdf } from "@/lib/print/coverPdf";
import { crispInkEdges } from "@/lib/print/lineArt";
import {
  BOOK_BLEED_IN,
  BOOK_PRINT_PPI,
  BOOK_TRIM_HEIGHT_IN,
  bookGutterIn,
  bookSheetPpi,
  type PageFit,
  type PageRotation,
} from "@/lib/print/pageLayout";
import { buildPdf, parsePages } from "@/server/digitalBookService";
import { createSignedUpload, getObjectBytes, putObject } from "@/server/storage/libraryFiles";

/** Everything for one print order lives under the customer's own folder. */
export const printOrderPaths = {
  coverFront: (userId: string, orderId: string) => `${userId}/_orders/${orderId}/cover-front.jpg`,
  interiorPdf: (userId: string, orderId: string) => `${userId}/_orders/${orderId}/interior.pdf`,
  coverPdf: (userId: string, orderId: string) => `${userId}/_orders/${orderId}/cover.pdf`,
};

/** A page manifest that satisfies the binding's page rules, or why it doesn't. */
export function parsePrintPages(input: unknown, bindingId: BookBindingId): ApiResult<DigitalBookPage[]> {
  const binding = getBookBinding(bindingId);
  const pages = parsePages(input, binding.maxPages);
  if (!pages) {
    return { data: null, error: { message: "Add at least one coloring page to the book.", code: "INVALID_PAGES" } };
  }
  if (pages.length < binding.minPages || pages.length % binding.pageMultiple !== 0) {
    return {
      data: null,
      error: { message: `A ${binding.shortLabel.toLowerCase()} book can't have ${pages.length} pages.`, code: "INVALID_PAGES" },
    };
  }
  return { data: pages, error: null };
}

export function createCoverFrontUpload(userId: string, orderId: string) {
  return createSignedUpload(printOrderPaths.coverFront(userId, orderId));
}

/** Never build a page image longer than this, however oddly a sheet is fitted (two page heights at print resolution). */
const INTERIOR_MAX_PX = BOOK_TRIM_HEIGHT_IN * 2 * BOOK_PRINT_PPI;

/**
 * An interior page as the printer wants it: grayscale (the interior prints in
 * black and white) and exactly 300 PPI at the size it is printed. A sheet with
 * fewer pixels is enlarged here with a high-quality kernel and its ink edges
 * sharpened again, which prints far cleaner than leaving the press to stretch
 * it; a larger one is reduced so the book file stays small.
 */
async function prepareInteriorSheet(
  dataUrl: string,
  placement: { rotation: PageRotation; fit?: PageFit; gutterIn: number; bleedIn: number },
): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const upright = await sharp(Buffer.from(base64, "base64"))
    .rotate()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = upright.info;
  const ppi = bookSheetPpi({
    imageWidth: width,
    imageHeight: height,
    rotationDeg: placement.rotation,
    fit: placement.fit,
    gutterIn: placement.gutterIn,
    bleedIn: placement.bleedIn,
  });
  const scale = Math.min(BOOK_PRINT_PPI / ppi, INTERIOR_MAX_PX / Math.max(width, height));

  let gray = sharp(upright.data, { raw: { width, height, channels: 1 } });
  if (Math.abs(scale - 1) > 0.01) {
    const resized = await gray
      .resize(Math.round(width * scale), Math.round(height * scale), { kernel: "lanczos3" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = scale > 1 ? crispInkEdges(new Uint8Array(resized.data)) : resized.data;
    gray = sharp(Buffer.from(pixels), {
      raw: { width: resized.info.width, height: resized.info.height, channels: 1 },
    });
  }
  // Deringing keeps black-on-white edges clean, so a page at full print resolution stays a reasonable size.
  const jpeg = await gray.jpeg({ quality: 88, trellisQuantisation: true, overshootDeringing: true }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

/** The uploaded front cover, checked and re-encoded as a plain sRGB JPEG at print size. */
async function loadCoverFront(userId: string, orderId: string): Promise<ApiResult<Uint8Array>> {
  let bytes: Buffer;
  try {
    bytes = (await getObjectBytes(printOrderPaths.coverFront(userId, orderId))).bytes;
  } catch {
    return { data: null, error: { message: "This book doesn't have a cover yet.", code: "COVER_REQUIRED" } };
  }
  try {
    const meta = await sharp(bytes).metadata();
    const ratio = (meta.width ?? 0) / (meta.height ?? 1);
    if (Math.abs(ratio - COVER_FRONT_WIDTH_IN / COVER_FRONT_HEIGHT_IN) > 0.01) {
      return { data: null, error: { message: "The cover image is the wrong shape. Please design the cover again.", code: "COVER_INVALID" } };
    }
    const jpeg = await sharp(bytes)
      .resize(COVER_FRONT_WIDTH_IN * COVER_PRINT_PPI, COVER_FRONT_HEIGHT_IN * COVER_PRINT_PPI, { fit: "fill" })
      .flatten({ background: "#ffffff" })
      .toColorspace("srgb")
      .jpeg({ quality: 92 })
      .toBuffer();
    return { data: jpeg, error: null };
  } catch {
    return { data: null, error: { message: "The cover image couldn't be read. Please design the cover again.", code: "COVER_INVALID" } };
  }
}

/**
 * Build and store the two files the printer needs: the interior (one PDF page
 * per printed side) and the cover spread. A framed book never reaches the page
 * edge, so its interior is at trim size and Lulu adds the bleed itself; an
 * edge-to-edge book is 8.75 × 11.25″ with the bleed drawn in, as Lulu requires.
 */
export async function buildPrintFiles(input: {
  userId: string;
  orderId: string;
  bindingId: BookBindingId;
  pages: DigitalBookPage[];
  cover: BookCoverDesign;
}): Promise<ApiResult<{ interiorPdfPath: string; coverPdfPath: string }>> {
  const front = await loadCoverFront(input.userId, input.orderId);
  if (front.error) return { data: null, error: front.error };

  const gutterIn = bookGutterIn(input.bindingId, input.pages.length);
  const bleedIn = input.pages.some((p) => p.kind === "photo" && p.fit === "full") ? BOOK_BLEED_IN : 0;
  const interior = await buildPdf(input.userId, input.pages, {
    gutterIn,
    bleedIn,
    prepareSheet: (dataUrl, page) =>
      prepareInteriorSheet(dataUrl, { rotation: page.rotation, fit: page.fit, gutterIn, bleedIn }),
  });
  if (interior.error) return { data: null, error: interior.error };

  try {
    const cover = await buildCoverPdf({
      frontJpeg: front.data!,
      bindingId: input.bindingId,
      pageCount: input.pages.length,
      backgroundColor: input.cover.backgroundColor,
    });
    const interiorPdfPath = printOrderPaths.interiorPdf(input.userId, input.orderId);
    const coverPdfPath = printOrderPaths.coverPdf(input.userId, input.orderId);
    await putObject(interiorPdfPath, interior.data!, "application/pdf");
    await putObject(coverPdfPath, cover, "application/pdf");
    return { data: { interiorPdfPath, coverPdfPath }, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Could not prepare the print files." } };
  }
}
