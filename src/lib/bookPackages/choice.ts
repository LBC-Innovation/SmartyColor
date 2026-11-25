import { PACKAGE_CHOICE_KEY } from "@/lib/bookPackages/types";
import type { BookBindingId } from "@/lib/print/bookBindings";

/**
 * Remember the chosen book for this visit, so sign-up, a closed tab and a reload keep it. The
 * wizard and the landing page's "Choose your book" tiles both write it here, so they can't drift.
 */
export function writePackageChoice(bindingId: BookBindingId): void {
  try {
    sessionStorage.setItem(PACKAGE_CHOICE_KEY, JSON.stringify({ bindingId, at: Date.now() }));
  } catch {
    /* the choice is also in the address */
  }
}
