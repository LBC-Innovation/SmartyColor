import type { BookBindingSpec } from "@/lib/print/bookBindings";
import type { Orientation } from "@/lib/print/settings";
import type {
  BookPagePlan,
  BookWizardBlankPage,
  BookWizardPage,
  BookWizardPhotoPage,
} from "@/lib/print/bookWizardTypes";

export function isAutoBlank(page: BookWizardPage): page is BookWizardBlankPage {
  return page.kind === "blank" && page.auto === true;
}

/** Pages the user chose: photos plus any blank or lined pages they inserted. */
export function contentPageCount(pages: BookWizardPage[]): number {
  return pages.filter((p) => !isAutoBlank(p)).length;
}

function targetPageCount(count: number, binding: BookBindingSpec): number {
  let total = Math.max(count, binding.minPages);
  total = Math.min(total, Math.max(binding.maxPages, count));
  if (binding.pageMultiple > 1) {
    const remainder = total % binding.pageMultiple;
    if (remainder !== 0) total += binding.pageMultiple - remainder;
  }
  return total;
}

/**
 * Lay the book out. Padding blanks sit in the page list like any other page, so
 * the user can drag them where they want; this only adds or trims them (from the
 * end) so the total satisfies the binding.
 */
export function computeBookPagePlan(
  pages: BookWizardPage[],
  binding: BookBindingSpec,
): BookPagePlan {
  const needed = Math.max(
    0,
    targetPageCount(contentPageCount(pages), binding) - contentPageCount(pages),
  );

  const allPages: BookWizardPage[] = [];
  const usedIds = new Set(pages.map((p) => p.id));
  let autoKept = 0;
  for (const page of pages) {
    if (isAutoBlank(page)) {
      if (autoKept >= needed) continue;
      autoKept += 1;
    }
    allPages.push(page);
  }
  let nextAutoId = 1;
  while (autoKept < needed) {
    while (usedIds.has(`auto-blank-${nextAutoId}`)) nextAutoId += 1;
    const id = `auto-blank-${nextAutoId}`;
    usedIds.add(id);
    allPages.push({ id, kind: "blank", auto: true });
    autoKept += 1;
  }

  const contentPages = allPages.filter((p): p is BookWizardPhotoPage => p.kind === "photo");
  const blankPages = allPages.filter((p): p is BookWizardBlankPage => p.kind === "blank");
  return {
    contentPages,
    blankPages,
    allPages,
    totalPages: allPages.length,
    photoCount: contentPages.length,
    blankCount: blankPages.length,
    paddingCount: needed,
  };
}

/** Insert pages after the last user-chosen page, ahead of any trailing padding. */
export function insertAfterContent(
  pages: BookWizardPage[],
  inserted: BookWizardPage[],
): BookWizardPage[] {
  let at = 0;
  pages.forEach((p, i) => {
    if (!isAutoBlank(p)) at = i + 1;
  });
  return [...pages.slice(0, at), ...inserted, ...pages.slice(at)];
}

/** Human-readable reason blank pages were added (for UI copy). */
export function explainBookPagePadding(
  photoCount: number,
  binding: BookBindingSpec,
  plan: Pick<BookPagePlan, "totalPages" | "blankCount">,
): string | null {
  if (plan.blankCount < 1) return null;

  const needsMin = photoCount < binding.minPages;
  const roundedAboveMin =
    binding.pageMultiple > 1 &&
    plan.totalPages > Math.max(photoCount, binding.minPages);

  if (needsMin && roundedAboveMin) {
    return `${plan.blankCount} blank ${plan.blankCount === 1 ? "page" : "pages"} added to reach ${plan.totalPages} pages (minimum ${binding.minPages}, multiple of ${binding.pageMultiple})`;
  }
  if (needsMin) {
    return `${plan.blankCount} blank ${plan.blankCount === 1 ? "page" : "pages"} added to meet the ${binding.minPages}-page minimum`;
  }
  if (roundedAboveMin || (binding.pageMultiple > 1 && plan.totalPages > photoCount)) {
    return `${plan.blankCount} blank ${plan.blankCount === 1 ? "page" : "pages"} added so the book is ${plan.totalPages} pages (multiple of ${binding.pageMultiple})`;
  }
  return `${plan.blankCount} blank ${plan.blankCount === 1 ? "page" : "pages"} added for this binding`;
}

export function effectiveOrientation(page: BookWizardPhotoPage): Orientation {
  const rotated = page.rotation === 90 || page.rotation === 270;
  if (rotated) {
    return page.sheetOrientation === "portrait" ? "landscape" : "portrait";
  }
  return page.sheetOrientation;
}

/** Rotation to preview how art will appear on a portrait book page (may differ from grid if not yet rotated). */
export function displayRotationForPrint(
  page: BookWizardPhotoPage,
  binding: BookBindingSpec,
): BookWizardPhotoPage["rotation"] {
  if (effectiveOrientation(page) === binding.requiredOrientation) {
    return page.rotation;
  }
  for (const extra of [90, 180, 270] as const) {
    const candidate = ((page.rotation + extra) % 360) as BookWizardPhotoPage["rotation"];
    if (effectiveOrientation({ ...page, rotation: candidate }) === binding.requiredOrientation) {
      return candidate;
    }
  }
  return page.rotation;
}

export type BookPageSpread = {
  spreadIndex: number;
  /** Book page number (1-based), right side when open. */
  rightPageNumber: number;
  right: BookWizardPage | null;
  /** Book page number (1-based), left side when open. */
  leftPageNumber: number;
  left: BookWizardPage | null;
};

export function bookSpreadCount(pageCount: number): number {
  if (pageCount < 1) return 0;
  return Math.ceil(pageCount / 2);
}

export function getBookPageSpread(pages: BookWizardPage[], spreadIndex: number): BookPageSpread {
  const rightIndex = spreadIndex * 2;
  const leftIndex = spreadIndex * 2 + 1;
  return {
    spreadIndex,
    rightPageNumber: rightIndex + 1,
    right: pages[rightIndex] ?? null,
    leftPageNumber: leftIndex + 1,
    left: pages[leftIndex] ?? null,
  };
}
