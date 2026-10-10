import type { BookBindingSpec } from "@/lib/print/bookBindings";
import type { Orientation } from "@/lib/print/settings";
import type {
  BookPagePlan,
  BookWizardBlankPage,
  BookWizardPage,
  BookWizardPhotoPage,
} from "@/lib/print/bookWizardTypes";

function blankPage(index: number): BookWizardBlankPage {
  return { id: `blank-${index}`, kind: "blank" };
}

export function computeBookPagePlan(
  photos: BookWizardPhotoPage[],
  binding: BookBindingSpec,
): BookPagePlan {
  const contentPages = [...photos];
  let total = contentPages.length;

  if (total < binding.minPages) {
    total = binding.minPages;
  }
  if (total > binding.maxPages) {
    total = binding.maxPages;
  }
  if (binding.pageMultiple > 1) {
    const remainder = total % binding.pageMultiple;
    if (remainder !== 0) {
      total += binding.pageMultiple - remainder;
    }
  }

  const blankCount = Math.max(0, total - contentPages.length);
  const blankPages = Array.from({ length: blankCount }, (_, i) => blankPage(i + 1));
  const allPages: BookWizardPage[] = [...contentPages, ...blankPages];

  return {
    contentPages,
    blankPages,
    allPages,
    totalPages: allPages.length,
    photoCount: contentPages.length,
    blankCount,
  };
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

export function reorderWizardPages(
  pages: BookWizardPage[],
  binding: BookBindingSpec,
): BookPagePlan {
  const contentPages = pages.filter((p): p is BookWizardPhotoPage => p.kind === "photo");
  const trailingBlanks = pages.filter((p) => p.kind === "blank");
  const plan = computeBookPagePlan(contentPages, binding);
  if (trailingBlanks.length === plan.blankCount) {
    return {
      ...plan,
      allPages: [...contentPages, ...plan.blankPages],
    };
  }
  return plan;
}

export function effectiveOrientation(page: BookWizardPhotoPage): Orientation {
  const rotated = page.rotation === 90 || page.rotation === 270;
  if (rotated) {
    return page.sheetOrientation === "portrait" ? "landscape" : "portrait";
  }
  return page.sheetOrientation;
}

export function nextRotation(current: BookWizardPhotoPage["rotation"]): BookWizardPhotoPage["rotation"] {
  return ((current + 90) % 360) as BookWizardPhotoPage["rotation"];
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
