"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Loader2 } from "lucide-react";
import { BookCoverCanvas } from "@/components/v2/book-order/BookCoverCanvas";
import { coverSourcesFor, type CoverPicture } from "@/components/v2/book-order/useCoverSources";
import type { BookBindingSpec, BookBindingId } from "@/lib/print/bookBindings";
import {
  COVER_FONTS,
  COVER_MIN_PPI,
  COVER_TEXT_MAX_LENGTH,
  COVER_TEXT_SIZE_MAX_PT,
  COVER_TEXT_SIZE_MIN_PT,
  type BookCoverDesign,
  type CoverLayout,
} from "@/lib/print/bookCover";
import { cn } from "@/lib/cn";

type Props = {
  design: BookCoverDesign;
  onChange: (next: BookCoverDesign) => void;
  binding: BookBindingSpec;
  pictures: CoverPicture[];
  picturesLoading: boolean;
  /** Offer the original color photos as well as the coloring pages. */
  canUseOriginals: boolean;
};

const LAYOUTS: { id: CoverLayout; label: string; hint: string }[] = [
  { id: "grid", label: "Photo grid", hint: "Every picture, in book order" },
  { id: "photo", label: "One photo", hint: "Pick your cover picture" },
  { id: "none", label: "No photo", hint: "Just color and words" },
];

const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const;

function Choice({
  selected,
  onClick,
  children,
  className,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm font-semibold transition",
        selected
          ? "border-v2-primary bg-v2-primary-light text-v2-link"
          : "border-gray-200 bg-white text-v2-navy hover:border-v2-primary/40",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="v2-label">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
        />
        <span className="font-mono text-xs uppercase text-v2-muted">{value}</span>
      </div>
    </div>
  );
}

/** Step 3 of the book wizard: build the front cover and see it exactly as it will print. */
export function BookCoverDesigner({ design, onChange, binding, pictures, picturesLoading, canUseOriginals }: Props) {
  const [showGuides, setShowGuides] = useState(true);
  const [lowestPpi, setLowestPpi] = useState<number | null>(null);
  const set = (patch: Partial<BookCoverDesign>) => onChange({ ...design, ...patch });
  const hasPictures = design.layout !== "none";
  const sources = coverSourcesFor(design, pictures);
  const chosenId = pictures.find((p) => p.pageId === design.coverPageId)?.pageId ?? pictures[0]?.pageId;
  const soft = hasPictures && !picturesLoading && lowestPpi != null && lowestPpi < COVER_MIN_PPI;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="lg:sticky lg:top-0 lg:self-start">
        <BookCoverCanvas
          design={design}
          sources={sources}
          bindingId={binding.id as BookBindingId}
          showGuides={showGuides}
          onRendered={(r) => setLowestPpi(r.lowestPpi)}
          className="mx-auto w-full max-w-xs rounded-sm lg:max-w-none"
        />
        {picturesLoading && hasPictures ? (
          <p className="mt-2 flex items-center justify-center gap-2 text-xs text-v2-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading your photos…
          </p>
        ) : null}
        <label className="mt-3 flex items-center justify-center gap-2 text-xs text-v2-muted">
          <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
          Show print guides
        </label>
        {showGuides ? (
          <p className="mt-1 text-center text-[11px] leading-snug text-v2-muted">
            <span className="font-semibold text-red-600">Red dashes</span>: the printer trims here, so the edge
            outside is cut off. <span className="font-semibold text-sky-600">Blue dots</span>: your words stay
            inside this box.
          </p>
        ) : null}
        {soft ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900" role="status">
            {design.layout === "photo" ? "This photo is" : "Some of these photos are"} small for a full-size
            cover and may print a little soft. {design.layout === "photo" ? "A larger photo or the photo grid" : "A color overlay"}{" "}
            can help.
          </p>
        ) : null}
      </div>

      <div className="space-y-5">
        <fieldset>
          <legend className="v2-label">Cover style</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Cover style">
            {LAYOUTS.map((l) => (
              <Choice key={l.id} selected={design.layout === l.id} onClick={() => set({ layout: l.id })} className="text-left">
                {l.label}
                <span className="mt-0.5 block text-xs font-normal text-v2-muted">{l.hint}</span>
              </Choice>
            ))}
          </div>
        </fieldset>

        {hasPictures && canUseOriginals ? (
          <fieldset>
            <legend className="v2-label">Pictures</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pictures">
              <Choice selected={design.imageSource === "photos"} onClick={() => set({ imageSource: "photos" })}>
                Original photos
              </Choice>
              <Choice selected={design.imageSource === "sheets"} onClick={() => set({ imageSource: "sheets" })}>
                Coloring pages
              </Choice>
            </div>
          </fieldset>
        ) : null}

        {design.layout === "photo" ? (
          <fieldset>
            <legend className="v2-label">Cover picture</legend>
            <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto p-0.5" role="radiogroup" aria-label="Cover picture">
              {pictures.map((p, i) => (
                <button
                  key={p.pageId}
                  type="button"
                  role="radio"
                  aria-checked={p.pageId === chosenId}
                  aria-label={p.title || `Picture ${i + 1}`}
                  onClick={() => set({ coverPageId: p.pageId })}
                  className={cn(
                    "h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white",
                    p.pageId === chosenId ? "border-v2-primary" : "border-transparent hover:border-v2-primary/40",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div>
          <label htmlFor="cover-text" className="v2-label">
            Words on the cover
          </label>
          <textarea
            id="cover-text"
            className="v2-input min-h-24 resize-y"
            maxLength={COVER_TEXT_MAX_LENGTH}
            placeholder="Our Summer at the Lake"
            value={design.text}
            onChange={(e) => set({ text: e.target.value })}
          />
          <p className="mt-1 text-xs text-v2-muted">
            Type anything you like. Press Enter for a new line; long text shrinks to fit.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cover-font" className="v2-label">
              Lettering
            </label>
            <select
              id="cover-font"
              className="v2-input"
              value={design.fontId}
              onChange={(e) => set({ fontId: e.target.value as BookCoverDesign["fontId"] })}
            >
              {COVER_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cover-size" className="v2-label">
              Size
            </label>
            <input
              id="cover-size"
              type="range"
              className="w-full accent-[var(--color-v2-primary)]"
              min={COVER_TEXT_SIZE_MIN_PT}
              max={COVER_TEXT_SIZE_MAX_PT}
              step={2}
              value={design.textSizePt}
              onChange={(e) => set({ textSizePt: Number(e.target.value) })}
            />
          </div>
          <fieldset>
            <legend className="v2-label">Where the words go</legend>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1" role="radiogroup" aria-label="Vertical position">
                {(["top", "middle", "bottom"] as const).map((pos) => (
                  <Choice key={pos} selected={design.textPosition === pos} onClick={() => set({ textPosition: pos })} className="capitalize">
                    {pos}
                  </Choice>
                ))}
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label="Alignment">
                {(["left", "center", "right"] as const).map((align) => {
                  const Icon = ALIGN_ICONS[align];
                  return (
                    <Choice key={align} selected={design.textAlign === align} onClick={() => set({ textAlign: align })} label={`Align ${align}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </Choice>
                  );
                })}
              </div>
            </div>
          </fieldset>
          <ColorField id="cover-text-color" label="Text color" value={design.textColor} onChange={(v) => set({ textColor: v })} />
        </div>

        {hasPictures ? (
          <div className="rounded-xl border border-gray-200 p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-v2-navy">
              <input
                type="checkbox"
                checked={design.overlayEnabled}
                onChange={(e) => set({ overlayEnabled: e.target.checked })}
              />
              Color overlay between the photos and the words
            </label>
            {design.overlayEnabled ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <ColorField id="cover-overlay-color" label="Overlay color" value={design.overlayColor} onChange={(v) => set({ overlayColor: v })} />
                <div>
                  <label htmlFor="cover-overlay-opacity" className="v2-label">
                    Transparency · {Math.round((1 - design.overlayOpacity) * 100)}% see-through
                  </label>
                  <input
                    id="cover-overlay-opacity"
                    type="range"
                    className="w-full accent-[var(--color-v2-primary)]"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round((1 - design.overlayOpacity) * 100)}
                    onChange={(e) => set({ overlayOpacity: 1 - Number(e.target.value) / 100 })}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <ColorField
            id="cover-background"
            label={hasPictures ? "Back cover color" : "Cover color"}
            value={design.backgroundColor}
            onChange={(v) => set({ backgroundColor: v })}
          />
          <p className="mt-1 text-xs text-v2-muted">
            {binding.id === "perfect_bound"
              ? "The back cover and spine print in this solid color."
              : "The back cover prints in this solid color."}{" "}
            &ldquo;Made with ♥ By ColorfulMemories.Net&rdquo; sits at the bottom of the back.
          </p>
        </div>
      </div>
    </div>
  );
}
