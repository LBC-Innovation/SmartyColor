"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type V2ProgressStepperProps = {
  photosCount: number;
  hasSheet: boolean;
  onDownloadPrint?: () => void;
  downloadPrintDisabled?: boolean;
  downloadingPrint?: boolean;
  /** Tighter layout for the docked sidebar */
  compact?: boolean;
};

export function V2ProgressStepper({
  photosCount,
  hasSheet,
  onDownloadPrint,
  downloadPrintDisabled,
  downloadingPrint,
  compact,
}: V2ProgressStepperProps) {
  const step1 = photosCount > 0;
  const step2 = hasSheet;
  const step3Ready = step1 && step2;

  const stepBadge = cn(
    "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
    compact ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm",
  );
  const rowGap = compact ? "gap-2" : "gap-3";
  const labelText = compact ? "text-xs font-medium leading-snug" : "text-sm font-medium";

  return (
    <ol className={cn("flex flex-col", compact ? "gap-2.5" : "gap-4")}>
      <li className={cn("flex items-center", rowGap)}>
        <span
          className={cn(
            stepBadge,
            step1 ? "bg-rose-400" : "bg-slate-200 text-slate-500",
          )}
        >
          {step1 ? (
            <Check className={compact ? "h-3 w-3" : "h-4 w-4"} strokeWidth={3} />
          ) : (
            "1"
          )}
        </span>
        <span
          className={cn(
            labelText,
            step1 ? "text-slate-800" : "text-slate-400",
          )}
        >
          Photos uploaded
        </span>
      </li>
      <li className={cn("flex items-center", rowGap)}>
        <span
          className={cn(
            stepBadge,
            step2
              ? "bg-emerald-500"
              : step1
                ? "bg-v2-primary"
                : "bg-slate-200 text-slate-500",
          )}
        >
          {step2 ? (
            <Check className={compact ? "h-3 w-3" : "h-4 w-4"} strokeWidth={3} />
          ) : (
            "2"
          )}
        </span>
        <span
          className={cn(
            labelText,
            step2 ? "text-slate-800" : "text-slate-400",
          )}
        >
          Sheets generated
        </span>
      </li>
      <li>
        {step3Ready ? (
          <button
            type="button"
            disabled={downloadPrintDisabled}
            onClick={onDownloadPrint}
            className={cn(
              "flex w-full items-center rounded-lg border text-left transition",
              rowGap,
              compact ? "px-2 py-2" : "gap-3 rounded-xl px-3 py-2.5",
              downloadPrintDisabled
                ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
                : "border-indigo-200 bg-indigo-50/80 text-v2-primary hover:border-indigo-300 hover:bg-indigo-50",
            )}
          >
            <span
              className={cn(stepBadge, "bg-v2-primary")}
            >
              {downloadingPrint ? (
                <Loader2
                  className={compact ? "h-3 w-3" : "h-4 w-4"}
                  aria-hidden
                />
              ) : (
                "3"
              )}
            </span>
            <span className={cn(compact ? "text-xs font-semibold leading-snug" : "text-sm font-semibold")}>
              Download &amp; print
            </span>
          </button>
        ) : (
          <div className={cn("flex items-center", rowGap)}>
            <span
              className={cn(
                stepBadge,
                "bg-slate-200 text-slate-500",
              )}
            >
              3
            </span>
            <span className={cn(labelText, "text-slate-400")}>
              Download &amp; print
            </span>
          </div>
        )}
      </li>
    </ol>
  );
}
