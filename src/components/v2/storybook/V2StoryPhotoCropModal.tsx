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
    event.currentTarget.setPointerCapture(event.pointerId);
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
      className="v2-modal fixed inset-0 z-50 flex items-center justify-center bg-v2-plum/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-crop-title"
      onClick={onClose}
    >
      <div
        className="v2-modal-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-v2-primary/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="v2-modal-strip h-1.5 w-full shrink-0" aria-hidden />
        <header className="v2-modal-head flex shrink-0 items-center justify-between px-5 pb-2 pt-5 sm:px-7">
          <h2 id="story-crop-title" className="v2-brand-title text-[1.5rem] leading-tight text-v2-ink">
            Crop for print
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="v2-hit -mr-2 rounded-full p-2 text-v2-muted transition hover:bg-v2-primary-light hover:text-v2-primary"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-7">
          <p className="mb-4 text-base leading-relaxed text-v2-muted">
            Drag the frame to reframe landscape or portrait shots for your story pages.
          </p>
          <div
            ref={boxRef}
            className="relative mx-auto aspect-[4/5] w-full max-w-sm touch-none select-none overflow-hidden rounded-xl bg-gray-100"
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
              {/* 44px grab area kept inside the frame so the box edge never clips it */}
              <span
                className="absolute bottom-0 right-0 flex h-11 w-11 cursor-se-resize items-end justify-end p-0.5"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  pointerDown(e, "se");
                }}
              >
                <span className="h-5 w-5 rounded-full border-2 border-v2-primary bg-white" />
              </span>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap justify-end gap-3 px-5 pb-5 pt-2 sm:px-7 sm:pb-7">
          <button
            type="button"
            className="v2-modal-btn v2-modal-btn--secondary"
            onClick={() => setCrop(DEFAULT_CROP)}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            className="v2-modal-btn v2-modal-btn--secondary"
            onClick={() => onSave(null)}
          >
            Full photo
          </button>
          <button
            type="button"
            className="v2-modal-btn v2-modal-btn--primary"
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
