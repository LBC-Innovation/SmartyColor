import type { BookBindingSpec } from "@/lib/print/bookBindings";
import { displayRotationForPrint } from "@/lib/print/bookPagePlan";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";

/** US letter portrait trim (8.5×11″). */
export const BOOK_TRIM_WIDTH_IN = 8.5;
export const BOOK_TRIM_HEIGHT_IN = 11;

export function printRotationForBookPage(
  page: BookWizardPhotoPage,
  binding: BookBindingSpec,
): number {
  return displayRotationForPrint(page, binding);
}

/**
 * Uniform scale so the full image fits in the page after rotation (no clip, no squish).
 */
export function computeBookPageContainScale(input: {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  rotationDeg: number;
}): number {
  const { containerWidth: cw, containerHeight: ch, rotationDeg } = input;
  const iw0 = input.imageWidth;
  const ih0 = input.imageHeight;

  if (cw <= 0 || ch <= 0 || iw0 <= 0 || ih0 <= 0) {
    return 1;
  }

  const quarter = rotationDeg === 90 || rotationDeg === 270;
  if (quarter) {
    return Math.min(cw / ih0, ch / iw0);
  }
  return Math.min(cw / iw0, ch / ih0);
}

/** pdf-lib: fit entire image on page (no clipping). */
export function computeBookPageContainDrawSize(input: {
  pageWidth: number;
  pageHeight: number;
  imageWidth: number;
  imageHeight: number;
  rotationDeg?: number;
}): { drawWidth: number; drawHeight: number } {
  const rotationDeg = input.rotationDeg ?? 0;
  const scale = computeBookPageContainScale({
    containerWidth: input.pageWidth,
    containerHeight: input.pageHeight,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    rotationDeg,
  });
  return {
    drawWidth: input.imageWidth * scale,
    drawHeight: input.imageHeight * scale,
  };
}
