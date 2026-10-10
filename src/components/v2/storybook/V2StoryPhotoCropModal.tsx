"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import type { PhotoCropRect } from "@/lib/v2/storybookTypes";

type V2StoryPhotoCropModalProps = {
  open: boolean;
  previewUrl: string;
  initialCrop: PhotoCropRect | null;
  onClose: () => void;
  onSave: (crop: PhotoCropRect | null) => void;
};

const DEFAULT_CROP: PhotoCropRect = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };

export function V2StoryPhotoCropModal({
  open,
  previewUrl,
  initialCrop,
  onClose,
  onSave,
}: V2StoryPhotoCropModalProps) {
  const [crop, setCrop] = useState<PhotoCropRect>(initialCrop ?? DEFAULT_CROP);
  const dragRef = useRef<{
    mode: "move" | "se";
    startX: number;
    startY: number;
    startCrop: PhotoCropRect;
  } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setCrop(initialCrop ?? DEFAULT_CROP);
  }, [open, initialCrop]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function pointerDown(
    event: React.PointerEvent,
    mode: "move" | "se",
  ) {
    event.preventDefault();
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startCrop: crop,
    };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    const box = boxRef.current;
    if (!drag || !box) return;

    const rect = box.getBoundingClientRect();
    const dx = (event.clientX - drag.startX) / rect.width;
    const dy = (event.clientY - drag.startY) / rect.height;
    const start = drag.startCrop;

    if (drag.mode === "move") {
      setCrop({
        ...start,
        x: clamp(start.x + dx, 0, 1 - start.width),
        y: clamp(start.y + dy, 0, 1 - start.height),
      });
      return;
    }

    setCrop({
      ...start,
      width: clamp(start.width + dx, 0.15, 1 - start.x),
      height: clamp(start.height + dy, 0.15, 1 - start.y),
    });
  }

  function pointerUp() {
    dragRef.current = null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-crop-title"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 id="story-crop-title" className="text-sm font-semibold text-v2-ink">
            Crop for print
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-v2-muted hover:bg-v2-bg-subtle"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-4">
          <p className="mb-3 text-xs text-v2-muted">
            Drag the frame to reframe landscape or portrait shots for your story pages.
          </p>
          <div
            ref={boxRef}
            className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-xl bg-gray-100"
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-contain"
              draggable={false}
            />
            <div
              className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
              }}
              onPointerDown={(e) => pointerDown(e, "move")}
            >
              <span
                className="absolute bottom-0 right-0 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-full border-2 border-v2-primary bg-white"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  pointerDown(e, "se");
                }}
              />
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-v2-muted hover:bg-v2-bg-subtle"
            onClick={() => setCrop(DEFAULT_CROP)}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-v2-muted hover:bg-v2-bg-subtle"
            onClick={() => onSave(null)}
          >
            Full photo
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-v2-primary px-4 py-2 text-sm font-semibold text-white hover:bg-v2-primary/90"
            onClick={() => onSave(crop)}
          >
            <Check className="h-4 w-4" />
            Save crop
          </button>
        </footer>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
