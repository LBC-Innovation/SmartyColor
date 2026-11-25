"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, Palette, Pencil } from "lucide-react";
import { ExtraChip } from "@/components/v2/book-packages/AllowanceChips";
import { BOOK_PACKAGES } from "@/content/marketing";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import { formatCredits } from "@/lib/credits/money";
import { cn } from "@/lib/cn";
import type { AlbumPurchaseCode } from "@/lib/purchaseCodes/types";

/** How many included photos are used, counting pages already made and pages being made right now. */
export function packagePhotosUsed(code: Pick<AlbumPurchaseCode, "pagesUsed" | "bundle">, inFlight: number): number {
  return Math.min(code.bundle.includedPages, code.pagesUsed + Math.max(0, inFlight));
}

/**
 * The package's allowance as one slim strip above the album: which book, a small bar of photos
 * used, what's left, the theme, and a Details popover with what the book includes. "Add photos"
 * and "Your book" already sit in the toolbar above, so they are not repeated here.
 */
export function PackageMeter({
  code,
  inFlight,
  pagePriceCents,
  theme,
  canEditTheme,
  onAddPhotos,
  onOrderBook,
  onEditTheme,
  onCancelPackage,
  canOrder,
}: {
  code: AlbumPurchaseCode;
  /** Included photos being made right now or waiting in the queue. */
  inFlight: number;
  pagePriceCents: number | null;
  theme: string | null;
  canEditTheme: boolean;
  onAddPhotos: () => void;
  onOrderBook: () => void;
  onEditTheme: () => void;
  /** Only for the buyer, before the book is ordered. */
  onCancelPackage?: () => void;
  canOrder: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Close the Details popover on Escape or a click outside it.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const included = code.bundle.includedPages;
  const used = packagePhotosUsed(code, inFlight);
  const left = Math.max(0, included - used);
  const pct = Math.min(100, Math.round((used / included) * 100));
  const ordered = Boolean(code.bookOrderId);
  const tokens = {
    ...packageTokens({
      bindingId: code.bundle.bindingId,
      includedPhotos: included,
      editsPerPhoto: code.bundle.editsPerPage,
    }),
    photosUsed: used,
    photosLeft: left,
    pagePrice: pagePriceCents != null ? formatCredits(pagePriceCents) : null,
  };
  const title = fillPackageCopy(BOOK_PACKAGES.meterTitle, tokens) ?? "Your book";
  const count = fillPackageCopy(BOOK_PACKAGES.meterCount, tokens);
  const extraLabel = pagePriceCents != null ? fillPackageCopy(BOOK_PACKAGES.meterExtraChip, tokens) : null;

  // The short status after the count: what's left, all used, or ordered.
  let status: React.ReactNode;
  if (ordered) {
    status = (
      <span className="text-v2-muted">
        {BOOK_PACKAGES.meterOrderedMain}
        {code.bookOrderId ? (
          <>
            {" · "}
            <Link href={`/orders/${code.bookOrderId}`} className="font-semibold text-v2-link">
              {BOOK_PACKAGES.meterViewOrder}
            </Link>
          </>
        ) : null}
      </span>
    );
  } else if (left === 0) {
    status = extraLabel ? <ExtraChip label={extraLabel} /> : <span className="text-v2-muted">{BOOK_PACKAGES.meterAllShort}</span>;
  } else {
    status = (
      <span className="whitespace-nowrap text-v2-muted">
        <span className="sm:hidden">{fillPackageCopy(BOOK_PACKAGES.meterLeftTiny, tokens)}</span>
        <span className="hidden sm:inline">{fillPackageCopy(BOOK_PACKAGES.meterLeftShort, tokens)}</span>
      </span>
    );
  }

  return (
    <section
      aria-label={title}
      // A size container, so the theme name hides when the strip itself is narrow (the book card
      // open beside it), not only on a narrow screen.
      className="@container flex items-center gap-x-3 rounded-2xl border border-v2-primary/20 bg-v2-primary-light/40 px-3 py-1 sm:flex-wrap sm:gap-x-4 sm:px-4 sm:py-2"
    >
      {/* Book and progress. */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <BookOpen className="h-5 w-5 shrink-0 text-v2-primary" aria-hidden />
        <span className="hidden shrink-0 text-sm font-semibold text-v2-ink sm:inline">{title}</span>
        <div
          className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-white @2xl:block"
          role="progressbar"
          aria-label="Included photos used"
          aria-valuemin={0}
          aria-valuemax={included}
          aria-valuenow={used}
          aria-valuetext={fillPackageCopy(BOOK_PACKAGES.meterMain, tokens) ?? undefined}
        >
          <div
            className="h-full rounded-full bg-v2-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="flex shrink-0 items-center gap-x-2 text-sm sm:shrink sm:flex-wrap sm:gap-y-1" aria-live="polite">
          <span className="whitespace-nowrap font-semibold tabular-nums text-v2-ink">{count}</span>
          {status}
        </p>
      </div>

      {/* Theme. */}
      {canEditTheme ? (
        <button
          type="button"
          onClick={onEditTheme}
          title={theme ?? undefined}
          aria-label={theme ? fillPackageCopy(BOOK_PACKAGES.themeRowSet, { theme }) + ". Change" : BOOK_PACKAGES.themeAdd}
          className="v2-hit-y group inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-full text-sm text-v2-muted sm:max-w-xs"
        >
          <Palette className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
          {/* Only when the strip has room for it; the full name stays in the tooltip and label. */}
          <span className="hidden min-w-0 truncate @4xl:inline">{theme ?? BOOK_PACKAGES.themeRowNone}</span>
          <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-v2-link group-hover:underline">
            <Pencil className="h-3.5 w-3.5 sm:hidden" aria-hidden />
            <span className="hidden sm:inline">{theme ? BOOK_PACKAGES.themeChange : BOOK_PACKAGES.themeAdd}</span>
          </span>
        </button>
      ) : null}

      {/* Details popover. */}
      <div ref={wrapRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="v2-hit-y inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-v2-link"
        >
          {BOOK_PACKAGES.meterDetails}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        {open ? (
          <div
            id={panelId}
            role="region"
            aria-label={BOOK_PACKAGES.meterDisclosure}
            className="absolute right-0 top-full z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-lg"
          >
            <p className="font-semibold text-v2-ink">{BOOK_PACKAGES.meterDisclosure}</p>
            <ul className="mt-2 space-y-1 text-v2-muted">
              {BOOK_PACKAGES.meterIncludes
                .filter((_, i) => i !== 1 || code.bundle.editsPerPage > 0)
                .map((line) => fillPackageCopy(line, tokens))
                .filter((l): l is string => Boolean(l))
                .map((line) => (
                  <li key={line}>• {line}</li>
                ))}
            </ul>
            <p className="mt-2 text-v2-muted">{BOOK_PACKAGES.meterExtraNote}</p>
            {!ordered ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAddPhotos();
                  }}
                  className="v2-btn-outline min-h-11 flex-1 text-sm"
                >
                  {BOOK_PACKAGES.meterAddPhotos}
                </button>
                {canOrder ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOrderBook();
                    }}
                    className="v2-btn-primary min-h-11 flex-1 text-sm"
                  >
                    {BOOK_PACKAGES.meterStepOrder}
                  </button>
                ) : null}
              </div>
            ) : null}
            {onCancelPackage ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCancelPackage();
                }}
                className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-v2-muted underline-offset-2 hover:text-v2-ink hover:underline"
              >
                {BOOK_PACKAGES.meterCancel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
