import type { AlbumPurchaseCode } from "@/lib/purchaseCodes/types";

/** The album's code is a book package (bought by the customer), not a gift code. */
export function isPackageCode(code: AlbumPurchaseCode | null | undefined): code is AlbumPurchaseCode {
  return Boolean(code && code.source === "package");
}

/**
 * Included photos still free for new uploads: the included count, less pages already made
 * (a deleted photo's page stays counted) and photos in the album that will take a slot when
 * their page is made. Mirrors how purchase_code_covers() claims slots; the database decides.
 */
export function packagePhotosLeft(code: AlbumPurchaseCode, photoIds: readonly string[]): number {
  const waiting = photoIds.filter((id) => !code.photos[id]).length;
  return Math.max(0, code.bundle.includedPages - code.pagesUsed - waiting);
}

/** Free touch-ups left on an included page; null for a page the package doesn't cover. */
export function touchUpsLeft(code: AlbumPurchaseCode, photo: { id: string; editCount?: number | null }): number | null {
  if (!code.photos[photo.id]) return null;
  return Math.max(0, code.bundle.editsPerPage - (photo.editCount ?? 0));
}
