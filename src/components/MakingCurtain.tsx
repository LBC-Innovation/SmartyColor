"use client";

import { CrayonRippleDots } from "@/components/CrayonRippleDots";
import { KidButton } from "@/components/KidButton";
import { cn } from "@/lib/cn";
import type { PrintPrefs } from "@/lib/print/settings";
import type { GeneratedSheet } from "@/lib/session/types";

type MakingCurtainProps = {
  mode: "loading" | "ready" | "error";
  sheet?: GeneratedSheet | null;
  printPrefs: PrintPrefs;
  error?: string | null;
  onDownload: () => void;
  onContinueEditing: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
  downloading?: boolean;
};

export function MakingCurtain({
  mode,
  sheet,
  printPrefs,
  error,
  onDownload,
  onContinueEditing,
  onRetry,
  onDismiss,
  downloading = false,
}: MakingCurtainProps) {
  const landscape = printPrefs.orientation === "landscape";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={
        mode === "loading"
          ? "Making your coloring sheet"
          : mode === "error"
            ? "Something went wrong"
            : "Your coloring sheet"
      }
    >
      <div className="flex max-h-[min(92vh,56rem)] w-full max-w-3xl flex-col items-center gap-5 overflow-y-auto rounded-(--radius-card) border-[3px] border-ink bg-paper/95 p-6 shadow-crayon-lg sm:p-8">
        {mode === "loading" ? (
          <div className="flex flex-col items-center gap-6 py-10 text-center">
            <CrayonRippleDots label="Making your coloring sheet" />
            <h2 className="font-display text-3xl font-bold text-balance text-ink sm:text-4xl">
              Making your coloring sheet…
            </h2>
            <p className="max-w-md font-body text-lg text-ink-soft">
              Sharpening crayons. Drawing big shapes. Saving the tiny details
              for last.
            </p>
          </div>
        ) : null}

        {mode === "error" ? (
          <div className="flex flex-col items-center gap-5 py-8 text-center">
            <p className="font-display text-xl text-crayon-coral">
              {error || "The crayons jammed."}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {onRetry ? (
                <KidButton onClick={onRetry}>Try again</KidButton>
              ) : null}
              <KidButton variant="secondary" onClick={onContinueEditing}>
                Continue editing
              </KidButton>
            </div>
          </div>
        ) : null}

        {mode === "ready" && sheet ? (
          <>
            <div
              className={cn(
                "w-full rounded-lg border-[3px] border-ink bg-white p-4 shadow-crayon sm:p-6",
                landscape ? "max-w-2xl" : "max-w-md",
              )}
            >
              {printPrefs.showTitle ? (
                <h2 className="mb-3 text-center font-display text-xl font-bold">
                  {sheet.title}
                </h2>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sheet.imageDataUrl}
                alt={sheet.title}
                className="w-full rounded-md border-2 border-ink bg-white"
              />
              {printPrefs.nameLine ? (
                <p className="mt-3 font-body text-sm text-ink-soft">
                  Name: ____________
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <KidButton
                variant="makeIt"
                onClick={onDownload}
                disabled={downloading}
              >
                {downloading ? "Preparing…" : "Download"}
              </KidButton>
              <KidButton variant="secondary" onClick={onContinueEditing}>
                Continue editing
              </KidButton>
            </div>
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="font-display text-sm font-semibold text-ink-soft underline-offset-2 hover:underline"
              >
                Close
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
