"use client";

import { Coins } from "lucide-react";
import { ExtraChip, ExtraNotice, IncludedChip } from "@/components/v2/book-packages/AllowanceChips";
import { PhotoThumb } from "@/components/v2/studio/PhotoThumb";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { BOOK_PACKAGES } from "@/content/marketing";
import { fillPackageCopy } from "@/lib/bookPackages/copy";
import { formatCredits } from "@/lib/credits/money";
import { track } from "@/lib/track";

const MAX_THUMBS = 10;

function ThumbRow({ files }: { files: File[] }) {
  const shown = files.slice(0, MAX_THUMBS);
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {shown.map((file, i) => (
        <li key={`${file.name}-${i}`} className="relative h-14 w-14 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <PhotoThumb file={file} />
        </li>
      ))}
      {files.length > shown.length ? (
        <li className="text-xs font-semibold text-v2-muted">
          {fillPackageCopy(BOOK_PACKAGES.splitMore, { n: files.length - shown.length })}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * Opens when someone picks more photos than the package still includes. Nothing uploads or is
 * charged before they answer: the first photos are included, the rest are marked extra with
 * their price, and extras always come from their credit, never from the package.
 */
export function ExtraPhotosConfirm({
  files,
  photosLeft,
  includedPhotos,
  pagePriceCents,
  balanceCents,
  onAll,
  onOnlyIncluded,
  onCancel,
}: {
  files: File[];
  photosLeft: number;
  includedPhotos: number;
  pagePriceCents: number | null;
  balanceCents: number | null;
  onAll: () => void;
  onOnlyIncluded: () => void;
  onCancel: () => void;
}) {
  const pickedCount = files.length;
  const includedCount = Math.min(photosLeft, pickedCount);
  const extraCount = pickedCount - includedCount;
  const extraTotalCents = pagePriceCents != null ? pagePriceCents * extraCount : null;
  const tokens = {
    pickedCount,
    includedCount,
    extraCount,
    includedPhotos,
    pagePrice: pagePriceCents != null ? formatCredits(pagePriceCents) : null,
    extraTotal: extraTotalCents != null ? formatCredits(extraTotalCents) : null,
    balance: balanceCents != null ? formatCredits(balanceCents) : null,
  };
  const none = includedCount === 0;
  const short = extraTotalCents != null && balanceCents != null && balanceCents < extraTotalCents;

  function confirmAll() {
    track("package_extra_confirmed", { kind: "photos", count: extraCount });
    onAll();
  }

  const title = none
    ? BOOK_PACKAGES.splitAllExtraTitle
    : (fillPackageCopy(BOOK_PACKAGES.splitTitle, tokens) ?? "More photos than your book includes");
  const description = none
    ? (fillPackageCopy(BOOK_PACKAGES.splitAllExtraDescription, tokens) ?? undefined)
    : (fillPackageCopy(BOOK_PACKAGES.splitDescription, tokens) ?? undefined);
  const primary = none
    ? (fillPackageCopy(BOOK_PACKAGES.splitAllExtraPrimary, tokens) ?? `Add ${pickedCount} extra photos`)
    : (fillPackageCopy(BOOK_PACKAGES.splitPrimary, tokens) ?? `Add all ${pickedCount}`);

  return (
    <V2Modal
      onClose={onCancel}
      maxWidthClass="max-w-md"
      icon={<Coins />}
      title={title}
      description={description}
    >
      <div className="space-y-4 px-5 pb-6 pt-1 sm:px-7">
        {includedCount > 0 ? (
          <div className="space-y-2">
            <IncludedChip />
            <ThumbRow files={files.slice(0, includedCount)} />
          </div>
        ) : null}
        <div className="space-y-2">
          <ExtraChip
            label={tokens.pagePrice ? `${tokens.pagePrice} extra each` : "Extra"}
          />
          <ThumbRow files={files.slice(includedCount)} />
        </div>

        <ExtraNotice>
          {(tokens.extraTotal ? fillPackageCopy(BOOK_PACKAGES.splitNote, tokens) : null) ??
            "Extra photos come from your credit, charged as each page is made. Your book package isn't used for them."}
        </ExtraNotice>
        {short ? (
          <p className="text-xs text-v2-muted">{fillPackageCopy(BOOK_PACKAGES.splitCredit, tokens)}</p>
        ) : null}

        <div className="flex flex-col gap-2">
          <button type="button" onClick={confirmAll} className="v2-btn-primary min-h-11 w-full">
            {primary}
          </button>
          {!none ? (
            <button type="button" onClick={onOnlyIncluded} className="v2-btn-outline min-h-11 w-full">
              {fillPackageCopy(BOOK_PACKAGES.splitSecondary, tokens) ?? "Add only the included photos"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-v2-link hover:underline"
          >
            {BOOK_PACKAGES.splitCancel}
          </button>
        </div>
      </div>
    </V2Modal>
  );
}
