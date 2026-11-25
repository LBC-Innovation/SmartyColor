"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Loader2, Printer } from "lucide-react";
import { PackageTileCard } from "@/components/v2/book-packages/PackageTileCard";
import { fillPackageCopy } from "@/lib/bookPackages/copy";
import { WizardProgress } from "@/components/v2/book-packages/WizardProgress";
import { BOOK_PACKAGES } from "@/content/marketing";
import { formatCredits } from "@/lib/credits/money";
import type { BookPackage } from "@/lib/bookPackages/types";
import { PRINT_AS_YOU_GO_PHOTO } from "@/lib/print/bookBindings";

export type PackagesLoad =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; packages: BookPackage[] };

function Skeleton() {
  return (
    <div className="v2-panel overflow-hidden" aria-hidden>
      <div className="aspect-[16/9] animate-pulse bg-v2-bg-subtle" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-v2-bg-subtle" />
        <div className="h-4 w-full animate-pulse rounded bg-v2-bg-subtle" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-v2-bg-subtle" />
        <div className="h-11 w-full animate-pulse rounded-xl bg-v2-bg-subtle" />
      </div>
    </div>
  );
}

/** Step 1: one card per package, plus a "Print as you go" card for the pay-per-page album. */
export function PackageTiles({
  load,
  signedIn,
  pagePriceCents,
  creatingPages,
  onChoose,
  onJustPages,
  onRetry,
  onBack,
  yearAlbum,
}: {
  load: PackagesLoad;
  signedIn: boolean;
  pagePriceCents: number | null;
  creatingPages: boolean;
  onChoose: (pkg: BookPackage) => void;
  onJustPages: () => void;
  onRetry: () => void;
  onBack: () => void;
  /** Opened from the home page's year album: say what this book is for. */
  yearAlbum?: { year: number; albumName: string } | null;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="v2-hit -ml-2 mb-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-v2-link"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {BOOK_PACKAGES.back}
      </button>
      <WizardProgress step={1} className="mb-5" />
      <h1 ref={headingRef} tabIndex={-1} className="v2-brand-title text-2xl text-v2-ink outline-none sm:text-3xl">
        {BOOK_PACKAGES.chooseTitle}
      </h1>
      <p className="mt-1 text-v2-muted">
        {yearAlbum
          ? fillPackageCopy(BOOK_PACKAGES.chooseSubtitleYear, { albumName: yearAlbum.albumName, year: yearAlbum.year })
          : BOOK_PACKAGES.chooseSubtitle}
      </p>
      {/* About the books, so it sits above the cards rather than under "Print as you go". */}
      {load.status === "ready" && load.packages.length > 0 ? (
        <p className="mt-1 text-sm text-v2-muted">{BOOK_PACKAGES.blankBacksNote}</p>
      ) : null}

      {load.status === "loading" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : null}

      {load.status === "error" ? (
        <div className="v2-panel mt-6 p-4">
          <p className="text-sm text-v2-ink" role="alert">
            {BOOK_PACKAGES.loadError}
          </p>
          <button type="button" onClick={onRetry} className="v2-btn-outline mt-3 min-h-11">
            {BOOK_PACKAGES.tryAgain}
          </button>
        </div>
      ) : null}

      {load.status === "ready" ? (
        <>
          {/* The packages plus "Print as you go": four cards in a row on wide screens, two by two below. */}
          <ul
            className={
              "mt-6 grid list-none gap-4 sm:grid-cols-2" +
              (load.packages.length >= 3
                ? " xl:grid-cols-4"
                : load.packages.length === 2
                  ? " lg:grid-cols-3"
                  : " lg:mx-auto lg:max-w-3xl")
            }
          >
            {load.packages.map((pkg) => (
              <li key={pkg.bindingId}>
                <PackageTileCard pkg={pkg} onChoose={onChoose} />
              </li>
            ))}
            <li>
              <PrintAsYouGoCard
                signedIn={signedIn}
                pagePriceCents={pagePriceCents}
                creatingPages={creatingPages}
                onJustPages={onJustPages}
              />
            </li>
          </ul>
        </>
      ) : null}

    </div>
  );
}

/** The picture for "Print as you go", or a drawn printer until the photo file exists. */
function PrintAsYouGoPicture() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        aria-hidden
        className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200"
      >
        <span className="relative flex flex-col items-center">
          {/* A page coming out of the printer. */}
          <span className="absolute -top-5 h-12 w-10 rounded-sm border border-gray-300 bg-white shadow-sm" />
          <Printer className="relative h-20 w-20 text-v2-primary" strokeWidth={1.5} />
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={PRINT_AS_YOU_GO_PHOTO.src}
      alt=""
      width={PRINT_AS_YOU_GO_PHOTO.width}
      height={PRINT_AS_YOU_GO_PHOTO.height}
      onError={() => setFailed(true)}
      className="aspect-[16/9] w-full object-cover"
    />
  );
}

/** The pay-per-page album, shown as a card like the packages. */
function PrintAsYouGoCard({
  signedIn,
  pagePriceCents,
  creatingPages,
  onJustPages,
}: {
  signedIn: boolean;
  pagePriceCents: number | null;
  creatingPages: boolean;
  onJustPages: () => void;
}) {
  const price = signedIn && pagePriceCents != null ? formatCredits(pagePriceCents) : null;
  const lines = signedIn ? BOOK_PACKAGES.justPagesLines : BOOK_PACKAGES.justPagesLinesGuest;
  const note = signedIn ? BOOK_PACKAGES.justPagesNote : BOOK_PACKAGES.justPagesNoteGuest;
  return (
    <article aria-labelledby="pkg-pages-name" className="v2-panel relative flex h-full cursor-pointer flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-v2-primary/40 hover:shadow-lg focus-within:ring-2 focus-within:ring-v2-primary/40 has-[:disabled]:cursor-default motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <PrintAsYouGoPicture />
      <div className="flex flex-1 flex-col p-4">
        <div id="pkg-pages-detail" className="flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="pkg-pages-name" className="text-lg font-bold text-v2-ink">
              {BOOK_PACKAGES.justPagesTitle}
            </h2>
            {price ? (
              <p className="shrink-0 text-lg font-bold tabular-nums text-v2-ink">
                {price}
                <span className="text-sm font-medium text-v2-muted">{BOOK_PACKAGES.justPagesPriceUnit}</span>
              </p>
            ) : null}
          </div>
          <ul className="mt-3 space-y-1.5">
            {lines.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-v2-ink">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 text-xs text-v2-muted">
            <Printer className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {note}
          </p>
        </div>
        <button
          type="button"
          onClick={onJustPages}
          disabled={creatingPages}
          aria-describedby="pkg-pages-detail"
          className="v2-btn-primary mt-4 min-h-11 w-full after:absolute after:inset-0 after:content-['']"
        >
          {creatingPages ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {BOOK_PACKAGES.justPagesButton}
        </button>
      </div>
    </article>
  );
}
