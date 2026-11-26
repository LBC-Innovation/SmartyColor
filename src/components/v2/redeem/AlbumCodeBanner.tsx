"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronDown, Gift } from "lucide-react";
import { cn } from "@/lib/cn";
import { bundleLines, pagesLeft, type AlbumPurchaseCode } from "@/lib/purchaseCodes/types";

/**
 * The album's purchase code, at the top of the studio: what it includes, how much is left, and
 * the three steps to the book it pays for. It also says up front that anything past the code is
 * an extra cost, labeled as such wherever it appears.
 */
export function AlbumCodeBanner({
  code,
  photoCount,
  onAddPhotos,
  onOrderBook,
  canOrder,
}: {
  code: AlbumPurchaseCode;
  photoCount: number;
  onAddPhotos: () => void;
  onOrderBook: () => void;
  /** The album has at least one page for the book. */
  canOrder: boolean;
}) {
  const [open, setOpen] = useState(false);
  const included = code.bundle.includedPages;
  const left = pagesLeft(code);
  const pct = Math.min(100, Math.round((code.pagesUsed / included) * 100));
  const ordered = Boolean(code.bookOrderId);

  const steps = [
    {
      label: photoCount >= included ? `${photoCount} photos added` : `Add up to ${included} photos`,
      done: photoCount >= included || code.pagesUsed >= included,
      action: photoCount < included && !ordered ? { label: "Add photos", onClick: onAddPhotos } : null,
    },
    {
      label: `${code.pagesUsed} of ${included} included pages made`,
      done: code.pagesUsed >= included,
      action: null,
    },
    {
      label: ordered ? "Book ordered" : "Order your book",
      done: ordered,
      action: !ordered && canOrder ? { label: "Order my book", onClick: onOrderBook } : null,
    },
  ];

  return (
    <section aria-label="Your book code" className="rounded-2xl border border-v2-primary/25 bg-v2-primary-light/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-v2-primary">
          <Gift className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-v2-ink">
            Your {code.campaign} book <span className="font-mono text-xs font-normal text-v2-muted">· {code.code}</span>
          </p>
          <p className="text-sm text-v2-muted">
            {ordered
              ? "Your code has paid for your book."
              : left > 0
                ? `${left} included ${left === 1 ? "page" : "pages"} left. Pages, edits and portrait conversions marked “Included” use your code.`
                : "All included pages are made. Extra pages are optional and marked with their price."}
          </p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-white"
            role="progressbar"
            aria-label="Included pages used"
            aria-valuemin={0}
            aria-valuemax={included}
            aria-valuenow={code.pagesUsed}
          >
            <div className="h-full rounded-full bg-v2-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                step.done ? "bg-v2-primary text-white" : "bg-v2-primary-light text-v2-primary",
              )}
              aria-hidden
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0 flex-1 text-v2-ink">{step.label}</span>
            {step.action ? (
              <button type="button" onClick={step.action.onClick} className="shrink-0 font-semibold text-v2-link">
                {step.action.label}
              </button>
            ) : null}
            {i === 2 && ordered && code.bookOrderId ? (
              <Link href={`/orders/${code.bookOrderId}`} className="shrink-0 font-semibold text-v2-link">
                View
              </Link>
            ) : null}
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-v2-link"
      >
        <BookOpen className="h-4 w-4" aria-hidden />
        What your code includes
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="mt-1 text-sm text-v2-muted">
          <ul className="space-y-1">
            {bundleLines(code.bundle).map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
          <p className="mt-2">
            You can add more photos, edits, another binding or faster shipping. Those cost extra, come from your wallet
            balance, and are always marked “extra” with their price before you pay.
          </p>
        </div>
      ) : null}
    </section>
  );
}
