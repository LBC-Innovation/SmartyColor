"use client";

import { useEffect, useState } from "react";
import { Columns2, Layers2, Loader2, Maximize2, Save, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type LightboxFocus = "original" | "sheet";
export type LightboxViewMode = "single" | "sideBySide" | "overlay";

type V2AssetLightboxProps = {
  focus: LightboxFocus;
  originalSrc: string;
  sheetSrc: string | null;
  viewMode: LightboxViewMode;
  onViewModeChange: (mode: LightboxViewMode) => void;
  onClose: () => void;
  onSaveOverlayRevision?: (opacityPercent: number) => void | Promise<void>;
  saveOverlayRevisionBusy?: boolean;
};

const viewModeOptions: {
  id: LightboxViewMode;
  label: string;
  shortLabel: string;
  icon: typeof Maximize2;
}[] = [
  { id: "single", label: "Single view", shortLabel: "Single", icon: Maximize2 },
  {
    id: "sideBySide",
    label: "Side by side",
    shortLabel: "Side by side",
    icon: Columns2,
  },
  { id: "overlay", label: "Overlay", shortLabel: "Overlay", icon: Layers2 },
];

function V2LightboxViewToggle({
  value,
  onChange,
  disabled,
}: {
  value: LightboxViewMode;
  onChange: (mode: LightboxViewMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-white/15 bg-white/5 p-0.5",
        disabled && "pointer-events-none opacity-50",
      )}
      role="group"
      aria-label="Comparison view"
    >
      {viewModeOptions.map((option) => {
        const active = value === option.id;
        const Icon = option.icon;
        const optionDisabled =
          disabled && option.id !== "single";
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            aria-label={option.label}
            disabled={optionDisabled}
            title={option.label}
            onClick={() => onChange(option.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition sm:px-2.5 sm:text-sm",
              active
                ? "bg-v2-primary text-white shadow-sm"
                : "text-white/75 hover:bg-white/10 hover:text-white",
              optionDisabled && "cursor-not-allowed",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
            <span className="hidden sm:inline">{option.shortLabel}</span>
          </button>
        );
      })}
    </div>
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

function LightboxOverlayPanel({
  originalSrc,
  sheetSrc,
  opacityPercent,
}: {
  originalSrc: string;
  sheetSrc: string;
  opacityPercent: number;
}) {
  const sheetOpacity = opacityPercent / 100;

  return (
    <figure className="flex min-h-0 min-w-0 flex-1 flex-col">
      <figcaption className="mb-2 shrink-0 text-center text-xs font-semibold uppercase tracking-wide text-white/70">
        Overlay comparison
      </figcaption>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/40 p-2">
        <div className="relative inline-block max-h-[min(78vh,900px)] max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={originalSrc}
            alt="Original photo"
            className="block max-h-[min(78vh,900px)] max-w-full object-contain"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sheetSrc}
            alt="Coloring sheet overlay"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            style={{ opacity: sheetOpacity }}
          />
        </div>
      </div>
    </figure>
  );
}

export function V2AssetLightbox({
  focus,
  originalSrc,
  sheetSrc,
  viewMode,
  onViewModeChange,
  onClose,
  onSaveOverlayRevision,
  saveOverlayRevisionBusy = false,
}: V2AssetLightboxProps) {
  const canCompare = Boolean(sheetSrc);
  const showSideBySide = viewMode === "sideBySide" && canCompare;
  const showOverlay = viewMode === "overlay" && canCompare;
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const canSaveOverlay =
    showOverlay &&
    Boolean(onSaveOverlayRevision) &&
    overlayOpacity > 0 &&
    !saveOverlayRevisionBusy;

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
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <V2LightboxViewToggle
            value={viewMode}
            disabled={!canCompare}
            onChange={onViewModeChange}
          />
          {showOverlay ? (
            <div className="flex min-w-[200px] flex-1 items-center gap-2 sm:max-w-xs">
              <label
                htmlFor="v2-lightbox-overlay-opacity"
                className="shrink-0 text-xs font-medium text-white/70 sm:text-sm"
              >
                Sheet
              </label>
              <input
                id="v2-lightbox-overlay-opacity"
                type="range"
                min={0}
                max={100}
                step={1}
                value={overlayOpacity}
                onChange={(event) =>
                  setOverlayOpacity(Number(event.target.value))
                }
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-v2-primary"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={overlayOpacity}
                aria-label="Coloring sheet overlay opacity"
              />
              <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-white/90 sm:text-sm">
                {overlayOpacity}%
              </span>
              {onSaveOverlayRevision ? (
                <button
                  type="button"
                  disabled={!canSaveOverlay}
                  title={
                    overlayOpacity === 0
                      ? "Increase sheet opacity to save a tinted revision"
                      : "Save this overlay as a new sheet revision"
                  }
                  onClick={() => void onSaveOverlayRevision(overlayOpacity)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:text-sm",
                    canSaveOverlay
                      ? "bg-white/15 text-white hover:bg-white/25"
                      : "cursor-not-allowed bg-white/5 text-white/40",
                  )}
                >
                  {saveOverlayRevisionBusy ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4"
                      aria-hidden
                    />
                  ) : (
                    <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                  )}
                  <span className="hidden sm:inline">Save revision</span>
                </button>
              ) : null}
            </div>
          ) : null}
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
            showSideBySide
              ? "flex-col md:flex-row"
              : "flex-col items-center justify-center",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {showOverlay && sheetSrc ? (
            <LightboxOverlayPanel
              originalSrc={originalSrc}
              sheetSrc={sheetSrc}
              opacityPercent={overlayOpacity}
            />
          ) : showSideBySide ? (
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
