import type { DigitalBookPage } from "@/lib/orders/types";

/** Every page is followed by its blank back: the book prints one page per sheet. */
export function hasBlankBacks(pages: readonly DigitalBookPage[] | null | undefined): boolean {
  if (!pages || pages.length < 2 || pages.length % 2 !== 0) return false;
  return pages.every((page, i) => (i % 2 === 1) === (page.kind === "blank" && page.back === true));
}

/** Every page is followed by a back ruled for writing. */
export function hasLinedBacks(pages: readonly DigitalBookPage[] | null | undefined): boolean {
  return hasBlankBacks(pages) && pages!.every((page, i) => i % 2 === 0 || (page.kind === "blank" && page.variant === "lined"));
}

/**
 * A book's size for people: "24 pages · blank backs" for 48 printed sides printed one page per
 * sheet, else "24 pages". `lined` says "lined backs" instead. `withPrinted` adds the printed
 * count, for support and admin.
 */
export function orderPagesLabel(
  pageCount: number,
  blankBacks: boolean,
  options?: { withPrinted?: boolean; lined?: boolean },
): string {
  if (!blankBacks) return `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;
  const pages = Math.floor(pageCount / 2);
  const printed = options?.withPrinted ? ` (${pageCount} printed)` : "";
  return `${pages} ${pages === 1 ? "page" : "pages"} · ${options?.lined ? "lined" : "blank"} backs${printed}`;
}
