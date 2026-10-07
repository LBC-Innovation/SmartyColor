/** Max size of the original file the user may pick. */
export const PHOTO_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

/** Stay under Vercel's ~4.5 MB function body limit (base64 + JSON overhead). */
export const VERCEL_JSON_BODY_BUDGET_BYTES = 4 * 1024 * 1024;

/** Room for mode, printPrefs, corrections, and JSON framing. */
export const PHOTO_JSON_OVERHEAD_BYTES = 64 * 1024;

export function estimateDataUrlRawBytes(dataUrl: string): number {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return dataUrl.length;
  const base64Len = match[1].length;
  return Math.floor((base64Len * 3) / 4);
}

/** Max decoded image bytes per file for a request that includes `imageCount` images. */
export function maxRawBytesPerImageInRequest(imageCount: 1 | 2): number {
  const budget = VERCEL_JSON_BODY_BUDGET_BYTES - PHOTO_JSON_OVERHEAD_BYTES;
  const base64BudgetPerImage = Math.floor(budget / imageCount);
  return Math.floor((base64BudgetPerImage * 3) / 4);
}

export function estimateJsonBodyBytes(parts: {
  photoDataUrl: string;
  sheetDataUrl?: string;
  extraText?: string;
}): number {
  let total = PHOTO_JSON_OVERHEAD_BYTES + (parts.extraText?.length ?? 0);
  total += parts.photoDataUrl.length;
  if (parts.sheetDataUrl) total += parts.sheetDataUrl.length;
  return total;
}
