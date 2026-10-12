import type { BookBindingSpec } from "@/lib/print/bookBindings";
import { displayRotationForPrint } from "@/lib/print/bookPagePlan";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";

export { BOOK_TRIM_WIDTH_IN, BOOK_TRIM_HEIGHT_IN } from "@/lib/print/pageLayout";

export function printRotationForBookPage(
  page: BookWizardPhotoPage,
  binding: BookBindingSpec,
): number {
  return displayRotationForPrint(page, binding);
}
