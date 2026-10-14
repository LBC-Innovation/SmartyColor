"use client";

import { RectangleVertical, Sparkles } from "lucide-react";
import { BusyOverlay } from "@/components/v2/book-order/BookPageThumbnailGrid";
import type { BookWizardPendingPhoto } from "@/lib/print/bookWizardTypes";

type Props = {
  photos: BookWizardPendingPhoto[];
  /** Photos with an AI job running on them, and what it is doing. */
  busy: Record<string, string>;
  onGenerate: (id: string) => void;
  onMakePortrait: (id: string) => void;
  generateHint: string;
  portraitHint: string;
};

/**
 * Photos in the chosen albums that have no coloring sheet yet. They can't
 * print until they do, so each one can get its sheet right here.
 */
export function BookPendingPhotos({ photos, busy, onGenerate, onMakePortrait, generateHint, portraitHint }: Props) {
  if (photos.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border-2 border-dashed border-gray-200 p-3 sm:p-4" aria-label="Photos without a coloring sheet">
      <div>
        <h3 className="text-sm font-semibold text-v2-ink">
          {photos.length} photo{photos.length === 1 ? "" : "s"} without a coloring sheet
        </h3>
        <p className="mt-0.5 text-xs text-v2-muted">
          These aren&apos;t in your book yet. Generate a sheet and the page joins the book in album order.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {photos.map((photo) => {
          const landscape = photo.orientation === "landscape";
          const busyLabel = busy[photo.id];
          return (
            <li
              key={photo.id}
              className="relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[8.5/11] w-full bg-v2-bg-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.imageUrl} alt={photo.title} className="h-full w-full object-contain p-2 opacity-80" />
                <span className="absolute inset-x-1.5 top-1.5 truncate rounded-md bg-slate-900/70 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
                  No coloring sheet yet
                </span>
                {busyLabel ? <BusyOverlay label={busyLabel} /> : null}
              </div>
              <div className="flex flex-col gap-1 border-t border-gray-100 p-1.5">
                <button
                  type="button"
                  className="v2-btn-primary h-8 w-full px-2 text-xs"
                  disabled={Boolean(busyLabel)}
                  onClick={() => onGenerate(photo.id)}
                  title={generateHint}
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Generate sheet
                </button>
                {landscape ? (
                  <button
                    type="button"
                    className="v2-btn-outline h-8 w-full px-2 text-xs"
                    disabled={Boolean(busyLabel)}
                    onClick={() => onMakePortrait(photo.id)}
                    title={portraitHint}
                  >
                    <RectangleVertical className="h-3.5 w-3.5" aria-hidden />
                    Portrait sheet
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
