"use client";

import { BookOpen } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { BOOK_PACKAGES } from "@/content/marketing";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import { formatCredits } from "@/lib/credits/money";
import { BOOK_BINDINGS, DIGITAL_FORMAT, type BookBindingId, type BookFormatId } from "@/lib/print/bookBindings";

/**
 * Asked before a package book is moved to another binding: the package only pays for printing its
 * own binding, so switching puts the whole printing price on the customer's credit.
 */
export function SwitchBindingModal({
  packageBindingId,
  includedPhotos,
  editsPerPhoto,
  to,
  otherPrintCents,
  onKeep,
  onSwitch,
}: {
  packageBindingId: BookBindingId;
  includedPhotos: number;
  editsPerPhoto: number;
  to: BookFormatId;
  /** The other format's printing price, when it is known. */
  otherPrintCents: number | null;
  onKeep: () => void;
  onSwitch: () => void;
}) {
  const tokens = packageTokens({ bindingId: packageBindingId, includedPhotos, editsPerPhoto });
  const otherName = to === "digital" ? DIGITAL_FORMAT.shortLabel : BOOK_BINDINGS[to].shortLabel;
  const values = { ...tokens, otherBindingName: otherName };
  const body =
    (otherPrintCents != null
      ? fillPackageCopy(BOOK_PACKAGES.switchBody, { ...values, otherPrintPrice: formatCredits(otherPrintCents) })
      : null) ?? fillPackageCopy(BOOK_PACKAGES.switchBodyNoPrice, values);
  return (
    <V2Modal
      onClose={onKeep}
      maxWidthClass="max-w-md"
      icon={<BookOpen />}
      title={fillPackageCopy(BOOK_PACKAGES.switchTitle, values) ?? "Switch binding?"}
      description={body ?? undefined}
    >
      <div className="space-y-4 px-5 pb-6 pt-1 sm:px-7">
        <p className="text-sm text-v2-muted">{BOOK_PACKAGES.switchBody2}</p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onKeep} className="v2-btn-primary min-h-11 w-full">
            {fillPackageCopy(BOOK_PACKAGES.switchKeep, values)}
          </button>
          <button type="button" onClick={onSwitch} className="v2-btn-outline min-h-11 w-full">
            {fillPackageCopy(BOOK_PACKAGES.switchConfirm, values)}
          </button>
        </div>
      </div>
    </V2Modal>
  );
}
