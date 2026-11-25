"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, FolderOpen, Loader2, Trash2, Undo2 } from "lucide-react";
import { V2Modal, V2ModalActions, V2ModalBody } from "@/components/v2/ui/V2Modal";
import { BOOK_PACKAGES } from "@/content/marketing";
import { useAuth } from "@/context/AuthContext";
import { isError } from "@/lib/api/client";
import { cancelBookPackage, fetchPackageRefundQuote } from "@/lib/bookPackages/client";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import type { BookPackageRefundQuote } from "@/lib/bookPackages/types";
import { formatCredits } from "@/lib/credits/money";
import { cn } from "@/lib/cn";
import { trackFormat } from "@/lib/marketing/events";
import { track } from "@/lib/track";

export type PackageCancelChoice = "keep" | "delete";

/**
 * Cancel an album's book package. Shows exactly what comes back (price paid minus pages made at
 * the page price, computed by the server), then lets the person keep the album and its pages or
 * delete it too. The refund itself never deletes anything: when "delete" is chosen the caller
 * runs the album delete afterwards, through the studio, so lists and navigation update as usual.
 */
export function CancelPackageModal({
  albumId,
  photoCount,
  initialChoice,
  quote: initialQuote,
  onClose,
  onCanceled,
}: {
  albumId: string;
  photoCount: number;
  initialChoice: PackageCancelChoice;
  /** A quote the caller already fetched; fetched here otherwise. */
  quote?: BookPackageRefundQuote | null;
  onClose: () => void;
  /** The refund is done. `deleteAlbum` says whether the caller should now delete the album. */
  onCanceled: (result: { refundCents: number; deleteAlbum: boolean }) => void | Promise<void>;
}) {
  const { setCreditsBalance } = useAuth();
  const [quote, setQuote] = useState<BookPackageRefundQuote | null | undefined>(initialQuote ?? undefined);
  const [loadError, setLoadError] = useState(false);
  const [choice, setChoice] = useState<PackageCancelChoice>(initialChoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialQuote !== undefined) return;
    let alive = true;
    void fetchPackageRefundQuote(albumId).then((res) => {
      if (!alive) return;
      if (isError(res)) setLoadError(true);
      else setQuote(res.data);
    });
    return () => {
      alive = false;
    };
  }, [albumId, initialQuote]);

  const refund = quote ? formatCredits(quote.refundCents) : "";
  const tokens = quote
    ? {
        ...packageTokens({ bindingId: quote.bindingId, includedPhotos: 0, editsPerPhoto: 0 }),
        pagesUsed: quote.pagesUsed,
        pagePrice: formatCredits(quote.pagePriceCents),
        refund,
        photos: photoCount === 1 ? "1 photo" : `${photoCount} photos`,
      }
    : {};

  async function confirm() {
    if (!quote) return;
    setBusy(true);
    setError(null);
    // Always refund without deleting here; the caller deletes through the studio when asked.
    const res = await cancelBookPackage(albumId, false);
    if (isError(res)) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    setCreditsBalance(res.data.creditsBalanceCents);
    track("package_refunded", {
      format: trackFormat(quote.bindingId),
      value: res.data.refundCents / 100,
      currency: "USD",
      album_deleted: choice === "delete",
    });
    await onCanceled({ refundCents: res.data.refundCents, deleteAlbum: choice === "delete" });
    setBusy(false);
  }

  const options: { id: PackageCancelChoice; title: string; sub: string; Icon: typeof Trash2 }[] = [
    { id: "keep", title: BOOK_PACKAGES.cancelKeep, sub: BOOK_PACKAGES.cancelKeepSub, Icon: FolderOpen },
    {
      id: "delete",
      title: BOOK_PACKAGES.cancelDelete,
      sub:
        photoCount > 0
          ? (fillPackageCopy(BOOK_PACKAGES.cancelDeleteSub, tokens) ?? "")
          : BOOK_PACKAGES.cancelDeleteSubEmpty,
      Icon: Trash2,
    },
  ];

  const ready = quote != null && quote.cancelable;

  return (
    <V2Modal
      onClose={() => !busy && onClose()}
      maxWidthClass="max-w-lg"
      icon={<Undo2 />}
      title={BOOK_PACKAGES.cancelTitle}
    >
      <V2ModalBody className="space-y-4">
        {quote === undefined && !loadError ? (
          <p className="flex items-center gap-2 text-sm text-v2-muted" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {BOOK_PACKAGES.cancelLoading}
          </p>
        ) : null}
        {loadError ? (
          <p role="alert" className="text-sm text-v2-ink">
            {BOOK_PACKAGES.cancelError}
          </p>
        ) : null}
        {quote && !quote.cancelable ? (
          <p className="text-sm text-v2-ink">{quote.bookOrdered ? BOOK_PACKAGES.cancelOrdered : BOOK_PACKAGES.cancelError}</p>
        ) : null}

        {ready ? (
          <>
            {/* The refund, as a short receipt. */}
            <dl className="rounded-2xl bg-gray-50 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-v2-muted">{fillPackageCopy(BOOK_PACKAGES.cancelPaid, tokens)}</dt>
                <dd className="tabular-nums text-v2-ink">{formatCredits(quote.pricePaidCents)}</dd>
              </div>
              <div className="mt-1.5 flex justify-between gap-3">
                <dt className="text-v2-muted">
                  {quote.pagesUsed > 0 ? fillPackageCopy(BOOK_PACKAGES.cancelPages, tokens) : BOOK_PACKAGES.cancelPagesNone}
                </dt>
                <dd className="tabular-nums text-v2-ink">
                  {quote.pagesChargedCents > 0 ? `−${formatCredits(quote.pagesChargedCents)}` : formatCredits(0)}
                </dd>
              </div>
              <div className="mt-3 flex justify-between gap-3 border-t border-gray-200 pt-3 text-base font-bold">
                <dt className="text-v2-ink">{BOOK_PACKAGES.cancelRefund}</dt>
                <dd className="tabular-nums text-v2-success-text">{refund}</dd>
              </div>
            </dl>
            <p className="text-xs text-v2-muted">{BOOK_PACKAGES.cancelRefundNote}</p>

            <div role="radiogroup" aria-label="What happens to the album" className="space-y-2">
              {options.map(({ id, title, sub, Icon }) => {
                const selected = choice === id;
                // Deleting is permanent: the option turns red and says so the moment it is picked.
                const danger = id === "delete";
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => setChoice(id)}
                    className={cn(
                      "flex min-h-11 w-full items-start gap-3 rounded-2xl border-2 p-3 text-left transition",
                      selected
                        ? danger
                          ? "border-rose-500 bg-rose-50"
                          : "border-v2-primary bg-v2-primary-light/50"
                        : danger
                          ? "border-gray-200 bg-white hover:border-rose-300"
                          : "border-gray-200 bg-white hover:border-v2-primary/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        selected ? (danger ? "bg-rose-600 text-white" : "bg-v2-primary text-white") : "bg-gray-100 text-v2-muted",
                      )}
                      aria-hidden
                    >
                      {selected ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block font-semibold", selected && danger ? "text-rose-900" : "text-v2-ink")}>
                        {title}
                      </span>
                      <span className={cn("block text-sm", danger ? "font-medium text-rose-800" : "text-v2-muted")}>{sub}</span>
                      {danger && selected ? (
                        <span className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-rose-900">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                          {BOOK_PACKAGES.cancelDeleteWarning}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {error ? (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {error}
              </p>
            ) : null}
          </>
        ) : null}
      </V2ModalBody>

      {/* Two equal buttons, centered under the dialog. */}
      <V2ModalActions className="sm:justify-center">
        <button type="button" disabled={busy} onClick={onClose} className="v2-modal-btn v2-modal-btn--secondary whitespace-nowrap sm:flex-1">
          {BOOK_PACKAGES.cancelNever}
        </button>
        {ready ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className={cn("v2-modal-btn whitespace-nowrap sm:flex-1", choice === "delete" ? "v2-modal-btn--danger" : "v2-modal-btn--primary")}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            {fillPackageCopy(
              choice === "delete" ? BOOK_PACKAGES.cancelConfirmDelete : BOOK_PACKAGES.cancelConfirmKeep,
              tokens,
            )}
          </button>
        ) : null}
      </V2ModalActions>
    </V2Modal>
  );
}

