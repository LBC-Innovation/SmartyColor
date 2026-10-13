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
import { BOOK_BLEED_IN, BOOK_TRIM_HEIGHT_IN, bookGutterIn } from "@/lib/print/pageLayout";
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

/** Longest side of an interior page image: a full page with bleed at 300 PPI. */
const INTERIOR_MAX_PX = (BOOK_TRIM_HEIGHT_IN + BOOK_BLEED_IN * 2) * COVER_PRINT_PPI;

/**
 * An interior page as the printer wants it: grayscale (the interior prints in
 * black and white) and no more than 300 PPI. Sheets come out of the studio as
 * large color PNGs, which would make the book file many times bigger for no
 * gain in print.
 */
async function prepareInteriorSheet(dataUrl: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const jpeg = await sharp(Buffer.from(base64, "base64"))
    .rotate()
    .resize(INTERIOR_MAX_PX, INTERIOR_MAX_PX, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .toColourspace("b-w")
    .jpeg({ quality: 92 })
    .toBuffer();
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

  const interior = await buildPdf(input.userId, input.pages, {
    gutterIn: bookGutterIn(input.bindingId, input.pages.length),
    bleedIn: input.pages.some((p) => p.kind === "photo" && p.fit === "full") ? BOOK_BLEED_IN : 0,
    prepareSheet: prepareInteriorSheet,
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
