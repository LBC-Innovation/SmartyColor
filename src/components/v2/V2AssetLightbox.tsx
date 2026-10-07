"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export type LightboxFocus = "original" | "sheet";

type V2AssetLightboxProps = {
  focus: LightboxFocus;
  originalSrc: string;
  sheetSrc: string | null;
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
  onClose: () => void;
};

function V2CompareToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 text-sm font-medium text-white/90",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span>Side-by-side comparison</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-v2-primary" : "bg-white/25",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 block h-6 w-6 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

function LightboxPanel({
  label,
  src,
  alt,
  emphasized,
}: {
  label: string;
  src: string;
  alt: string;
  emphasized?: boolean;
}) {
  return (
    <figure
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col",
        emphasized && "ring-2 ring-v2-primary/80 ring-offset-2 ring-offset-slate-950 rounded-xl",
      )}
    >
      <figcaption className="mb-2 shrink-0 text-center text-xs font-semibold uppercase tracking-wide text-white/70">
        {label}
      </figcaption>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/40 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-[min(78vh,900px)] w-full object-contain"
        />
      </div>
    </figure>
  );
}

export function V2AssetLightbox({
  focus,
  originalSrc,
  sheetSrc,
  compare,
  onCompareChange,
  onClose,
}: V2AssetLightboxProps) {
  const canCompare = Boolean(sheetSrc);
  const showBoth = compare && canCompare;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const title =
    focus === "original" ? "Original photo" : "Coloring sheet";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="v2-lightbox-title"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <h2 id="v2-lightbox-title" className="text-base font-semibold text-white">
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <V2CompareToggle
            checked={compare}
            disabled={!canCompare}
            onChange={onCompareChange}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Close full screen view"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col p-4 sm:p-6"
        onClick={onClose}
        role="presentation"
      >
        <div
          className={cn(
            "mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 gap-4 sm:gap-6",
            showBoth ? "flex-col md:flex-row" : "flex-col items-center justify-center",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {showBoth ? (
            <>
              <LightboxPanel
                label="Original"
                src={originalSrc}
                alt="Original photo"
                emphasized={focus === "original"}
              />
              <LightboxPanel
                label="Coloring sheet"
                src={sheetSrc!}
                alt="Coloring sheet"
                emphasized={focus === "sheet"}
              />
            </>
          ) : focus === "original" ? (
            <LightboxPanel
              label="Original"
              src={originalSrc}
              alt="Original photo"
              emphasized
            />
          ) : sheetSrc ? (
            <LightboxPanel
              label="Coloring sheet"
              src={sheetSrc}
              alt="Coloring sheet"
              emphasized
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
