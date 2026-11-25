"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Coins, Check, Loader2, Truck, BookOpen } from "lucide-react";
import { V2GuestGate } from "@/components/v2/auth/V2GuestGate";
import { WizardProgress } from "@/components/v2/book-packages/WizardProgress";
import { BOOK_PACKAGES } from "@/content/marketing";
import { isError } from "@/lib/api/client";
import { buyPackageWithCredit, startPackageCheckout } from "@/lib/bookPackages/client";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import { trackPackagePurchasedOnce } from "@/lib/bookPackages/track";
import {
  PACKAGE_CHOICE_KEY,
  PACKAGE_PRICE_CHANGED_CODE,
  PACKAGE_UNAVAILABLE_CODE,
  type BookPackage,
  type BookPackagePurchase,
} from "@/lib/bookPackages/types";
import { formatCredits } from "@/lib/credits/money";
import { withNextParam } from "@/lib/auth/nextPath";
import { requestMigrationAfterSignup } from "@/lib/marketing/savePrompt";
import { centsToValue, trackFormat } from "@/lib/marketing/events";
import { BINDING_PHOTOS } from "@/lib/print/bookBindings";
import { track } from "@/lib/track";
import { cn } from "@/lib/cn";

type Method = "credit" | "card";

/** Step 2: what the package includes and does not, then pay once (wallet or card). */
export function PackagePay({
  pkg,
  signedIn,
  balanceCents,
  pagePriceCents,
  editPriceCents,
  canceledNote,
  onDismissCanceled,
  onBack,
  onPaid,
  onUnavailable,
  onReload,
}: {
  pkg: BookPackage;
  signedIn: boolean;
  balanceCents: number | null;
  pagePriceCents: number | null;
  editPriceCents: number | null;
  /** Back from a canceled Stripe payment. */
  canceledNote: boolean;
  onDismissCanceled: () => void;
  onBack: () => void;
  onPaid: (purchase: BookPackagePurchase) => void;
  onUnavailable: () => void;
  /** Reload the catalog (after a price change). */
  onReload: () => void;
}) {
  const photo = BINDING_PHOTOS[pkg.bindingId];
  const tokens = packageTokens(pkg);
  const covers = balanceCents != null && balanceCents >= pkg.priceCents;
  const [method, setMethod] = useState<Method>(covers ? "credit" : "card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const price = formatCredits(pkg.priceCents);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // The balance can change under us (it loads after the page does): never stay on credit it can't cover.
  const effectiveMethod: Method = covers ? method : "card";

  const next = `/studio/new?book=${pkg.bindingId}&step=pay`;
  function rememberChoice() {
    requestMigrationAfterSignup();
    try {
      sessionStorage.setItem(PACKAGE_CHOICE_KEY, JSON.stringify({ bindingId: pkg.bindingId, at: Date.now() }));
    } catch {
      /* the choice is also in the address */
    }
  }

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPriceChanged(false);
    const base = { bindingId: pkg.bindingId, expectedPriceCents: pkg.priceCents };
    track("package_pay_started", {
      format: trackFormat(pkg.bindingId),
      value: centsToValue(pkg.priceCents),
      currency: "USD",
      method: effectiveMethod,
    });

    if (effectiveMethod === "credit") {
      const res = await buyPackageWithCredit(base);
      if (isError(res)) {
        setBusy(false);
        handleFailure(res.error.code);
        return;
      }
      trackPackagePurchasedOnce(res.data, "credit");
      onPaid(res.data);
      return;
    }

    const res = await startPackageCheckout(base);
    if (isError(res)) {
      setBusy(false);
      handleFailure(res.error.code);
      return;
    }
    // Stripe takes over; this page comes back through the return URL.
    window.location.assign(res.data.checkoutUrl);
  }

  function handleFailure(code: string | undefined) {
    if (code === PACKAGE_UNAVAILABLE_CODE) {
      onUnavailable();
    } else if (code === PACKAGE_PRICE_CHANGED_CODE) {
      setPriceChanged(true);
      onReload();
    } else if (code === "INSUFFICIENT_CREDITS") {
      setMethod("card");
      setError(BOOK_PACKAGES.creditShort);
    } else {
      setError(BOOK_PACKAGES.payFailed);
    }
  }

  const included = BOOK_PACKAGES.includedLines
    .filter((_, i) => i !== 1 || pkg.editsPerPhoto > 0)
    .map((l) => fillPackageCopy(l, tokens))
    .filter((l): l is string => Boolean(l));
  const pagePriceLine =
    pagePriceCents != null
      ? fillPackageCopy(BOOK_PACKAGES.notIncludedPhotos, { ...tokens, pagePrice: formatCredits(pagePriceCents) })
      : null;
  const editPriceLine =
    editPriceCents != null && editPriceCents > 0
      ? fillPackageCopy(BOOK_PACKAGES.notIncludedTouchUps, { editPrice: formatCredits(editPriceCents) })
      : null;

  const buttonLabel = busy
    ? effectiveMethod === "credit"
      ? BOOK_PACKAGES.buttonPaying
      : BOOK_PACKAGES.buttonOpening
    : fillPackageCopy(effectiveMethod === "credit" ? BOOK_PACKAGES.buttonCredit : BOOK_PACKAGES.buttonCard, {
        packagePrice: price,
      });

  const payButton = (
    <>
      <button type="button" onClick={() => void pay()} disabled={busy} className="v2-btn-primary min-h-12 w-full text-base">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {buttonLabel}
      </button>
      <p className="mt-2 text-center text-xs text-v2-muted">{BOOK_PACKAGES.underButton}</p>
      {!covers && balanceCents != null && balanceCents > 0 ? (
        <p className="mt-1 text-center text-xs text-v2-muted">
          {fillPackageCopy(BOOK_PACKAGES.creditStays, { balance: formatCredits(balanceCents) })}
        </p>
      ) : null}
    </>
  );

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-40 pt-6 sm:px-6 sm:pb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="v2-hit -ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-v2-link"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {BOOK_PACKAGES.back}
        </button>
      </div>
      <WizardProgress step={2} className="mb-5" />

      {canceledNote ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-v2-bg-subtle px-3 py-2.5 text-sm text-v2-ink">
          <p>{BOOK_PACKAGES.canceledNote}</p>
          <button type="button" onClick={onDismissCanceled} className="v2-hit shrink-0 font-semibold text-v2-link">
            OK
          </button>
        </div>
      ) : null}

      <div className="v2-panel p-5 sm:p-8">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.src} alt="" className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover" />
          <div className="min-w-0">
            <h1 ref={headingRef} tabIndex={-1} className="v2-brand-title break-words text-xl text-v2-ink outline-none sm:text-2xl">
              {fillPackageCopy(BOOK_PACKAGES.payTitle, tokens)}
            </h1>
            <p className="text-2xl font-bold tabular-nums text-v2-ink">{price}</p>
          </div>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-v2-ink">{BOOK_PACKAGES.included}</h2>
        <ul className="mt-2 space-y-1.5">
          {included.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-v2-ink">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-success-text" strokeWidth={2.5} aria-hidden />
              {line}
            </li>
          ))}
        </ul>

        <h2 className="mt-5 text-sm font-semibold text-v2-ink">{BOOK_PACKAGES.notIncluded}</h2>
        <ul className="mt-2 space-y-1.5">
          <li className="flex items-start gap-2 text-sm text-v2-muted">
            <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {BOOK_PACKAGES.notIncludedShipping}
          </li>
          {pagePriceLine ? (
            <li className="flex items-start gap-2 text-sm text-v2-muted">
              <Coins className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {pagePriceLine}
            </li>
          ) : null}
          {editPriceLine ? (
            <li className="flex items-start gap-2 text-sm text-v2-muted">
              <Coins className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {editPriceLine}
            </li>
          ) : null}
        </ul>
        <p className="mt-3 text-xs text-v2-muted">{BOOK_PACKAGES.oneAlbumNote}</p>
        <p className="mt-1 text-xs text-v2-muted">{BOOK_PACKAGES.refundPolicy}</p>

        {signedIn ? (
          <>
            {covers ? (
              <fieldset className="mt-6">
                <legend className="text-sm font-semibold text-v2-ink">{BOOK_PACKAGES.payHeading}</legend>
                <div className="mt-2 space-y-2">
                  {(
                    [
                      {
                        id: "credit" as const,
                        label: fillPackageCopy(BOOK_PACKAGES.payCredit, { balance: formatCredits(balanceCents ?? 0) }),
                        sub: fillPackageCopy(BOOK_PACKAGES.payCreditSub, {
                          balanceAfter: formatCredits((balanceCents ?? 0) - pkg.priceCents),
                        }),
                      },
                      { id: "card" as const, label: BOOK_PACKAGES.payCard, sub: BOOK_PACKAGES.payCardSub },
                    ] satisfies { id: Method; label: string | null; sub: string | null }[]
                  ).map((opt) => (
                    <label
                      key={opt.id}
                      className={cn(
                        "flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border px-3 py-3",
                        effectiveMethod === opt.id ? "border-v2-primary bg-v2-primary-light/40" : "border-gray-200 bg-white",
                      )}
                    >
                      <input
                        type="radio"
                        name="package-pay-method"
                        value={opt.id}
                        checked={effectiveMethod === opt.id}
                        onChange={() => setMethod(opt.id)}
                        disabled={busy}
                        className="mt-1 h-4 w-4 accent-[var(--color-v2-primary,#6d28d9)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-v2-ink">{opt.label}</span>
                        <span className="block text-xs text-v2-muted">{opt.sub}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {priceChanged ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                {fillPackageCopy(BOOK_PACKAGES.priceChanged, { packagePrice: price })}
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 text-sm text-amber-900" role="alert">
                {error}
              </p>
            ) : null}

            {/* Phones: the button sticks to the bottom so a thumb reaches it. */}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:z-auto sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
              <div className="mx-auto max-w-xl">{payButton}</div>
            </div>
          </>
        ) : (
          <div className="mt-6">
            <V2GuestGate
              icon={BookOpen}
              title={BOOK_PACKAGES.guestTitle}
              body={BOOK_PACKAGES.guestBody}
              primary={{
                label: BOOK_PACKAGES.guestPrimary,
                href: withNextParam("/sign-up", next),
                onClick: rememberChoice,
              }}
              secondary={{
                label: BOOK_PACKAGES.guestSecondary,
                href: withNextParam("/sign-in", next),
                onClick: rememberChoice,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
