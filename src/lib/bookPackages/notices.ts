import { BOOK_PACKAGES } from "@/content/marketing";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import { formatCredits } from "@/lib/credits/money";
import { codeCoversAction, type AlbumPurchaseCode } from "@/lib/purchaseCodes/types";

export type PackageEditNotice = {
  tone: "info" | "cost";
  text: string;
  buttonLabel?: string;
  buttonShortLabel?: string;
  buttonAriaLabel?: string;
};

/**
 * What the next touch-up on a page costs in a package album, said under the edit box. A free
 * touch-up shows how many are left; a paid one says it comes from credit (never the package) and
 * puts the price on the send button.
 */
export function packageEditNotice(
  code: AlbumPurchaseCode,
  photo: { id: string; editCount?: number | null },
  /** What one paid touch-up costs the wallet, in cents; null while unknown. */
  editPriceCents: number | null,
): PackageEditNotice | null {
  const tokens: Record<string, string | number | null> = {
    ...packageTokens({
      bindingId: code.bundle.bindingId,
      includedPhotos: code.bundle.includedPages,
      editsPerPhoto: code.bundle.editsPerPage,
    }),
    editPrice: editPriceCents != null ? formatCredits(editPriceCents) : null,
  };
  if (codeCoversAction(code, "edit", photo)) {
    const left = code.bundle.editsPerPage - (photo.editCount ?? 0);
    const withLeft = { ...tokens, touchUpsLeft: left };
    const text =
      (left === 1 ? fillPackageCopy(BOOK_PACKAGES.editInfoOne, withLeft) : null) ??
      fillPackageCopy(BOOK_PACKAGES.editInfoMany, withLeft);
    return { tone: "info", text: text ?? "" };
  }
  if (editPriceCents == null || editPriceCents <= 0) return null;
  const includedPage = Boolean(code.photos[photo.id]);
  return {
    tone: "cost",
    text: fillPackageCopy(includedPage ? BOOK_PACKAGES.editCostUsed : BOOK_PACKAGES.editCostExtraPage, tokens) ?? "",
    buttonLabel: fillPackageCopy(BOOK_PACKAGES.touchUpButton, tokens) ?? undefined,
    buttonShortLabel: formatCredits(editPriceCents),
    buttonAriaLabel: `Send touch-up, ${formatCredits(editPriceCents)} from your credit`,
  };
}
