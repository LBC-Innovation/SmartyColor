"use client";

import { useState, type DragEvent } from "react";
import { GripVertical, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { GeneratedSheet } from "@/lib/session/types";
import type { PrintPrefs } from "@/lib/print/settings";

export type V2LibraryPhoto = {
  id: string;
  previewUrl: string;
  photoDataUrl: string;
  printPrefs: PrintPrefs;
  sheet: GeneratedSheet | null;
  generating: boolean;
};

type V2PhotoLibraryListProps = {
  photos: V2LibraryPhoto[];
  pendingUploads: { id: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (photos: V2LibraryPhoto[]) => void;
  onGenerateSheet: (id: string) => void;
  generateDisabled?: boolean;
};

function PendingLibraryRow({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-2"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex h-9 w-6 shrink-0 items-center justify-center text-slate-300">
        <GripVertical className="h-4 w-4" aria-hidden />
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-slate-100">
          <Loader2 className="h-6 w-6 animate-spin text-v2-primary" />
        </div>
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50">
          <span className="text-[10px] font-medium text-slate-400">Sheet</span>
        </div>
      </div>
    </div>
  );
}

export function V2PhotoLibraryList({
  photos,
  pendingUploads,
  selectedId,
  onSelect,
  onReorder,
  onGenerateSheet,
  generateDisabled,
}: V2PhotoLibraryListProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function reorderByIds(fromId: string, toId: string) {
    if (fromId === toId) return;
    const fromIndex = photos.findIndex((p) => p.id === fromId);
    const toIndex = photos.findIndex((p) => p.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...photos];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorder(next);
  }

  function onHandleDragStart(event: DragEvent<HTMLButtonElement>, photoId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", photoId);
    setDraggingId(photoId);
  }

  function onRowDragEnd() {
    setDraggingId(null);
    setDropTargetId(null);
  }

  function onRowDragOver(event: DragEvent<HTMLDivElement>, photoId: string) {
    event.preventDefault();
    if (!draggingId || draggingId === photoId) return;
    setDropTargetId(photoId);
  }

  function onRowDrop(event: DragEvent<HTMLDivElement>, photoId: string) {
    event.preventDefault();
    const fromId = event.dataTransfer.getData("text/plain") || draggingId;
    if (fromId) reorderByIds(fromId, photoId);
    onRowDragEnd();
  }

  return (
    <div className="flex max-h-[min(640px,70vh)] flex-col gap-2 overflow-y-auto pr-0.5">
      {pendingUploads.map((pending, index) => (
        <PendingLibraryRow
          key={pending.id}
          label={`Uploading photo ${index + 1} of ${pendingUploads.length}`}
        />
      ))}

      {photos.map((photo) => {
        const isSelected = photo.id === selectedId;
        const isDragging = draggingId === photo.id;
        const isDropTarget = dropTargetId === photo.id && draggingId !== photo.id;

        return (
          <div
            key={photo.id}
            onClick={() => onSelect(photo.id)}
            onDragOver={(event) => onRowDragOver(event, photo.id)}
            onDrop={(event) => onRowDrop(event, photo.id)}
            onDragLeave={() => {
              if (dropTargetId === photo.id) setDropTargetId(null);
            }}
            className={cn(
              "cursor-pointer",
              "rounded-xl border bg-white p-2 transition-shadow",
              isSelected
                ? "border-v2-primary ring-2 ring-v2-primary/30"
                : "border-slate-200/90 hover:border-slate-300",
              isDragging && "opacity-50",
              isDropTarget && "border-v2-primary shadow-md shadow-indigo-200/50",
            )}
          >
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                draggable
                onClick={(event) => event.stopPropagation()}
                onDragStart={(event) => onHandleDragStart(event, photo.id)}
                onDragEnd={onRowDragEnd}
                className="flex w-6 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-50 hover:text-slate-600 active:cursor-grabbing"
                aria-label="Drag to reorder"
              >
                <GripVertical className="h-4 w-4" />
              </button>

              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                <div className="relative overflow-hidden rounded-lg bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt=""
                    className="aspect-[4/3] h-full w-full object-cover"
                  />
                </div>

                {photo.sheet ? (
                  <div className="relative overflow-hidden rounded-lg border border-slate-100 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.sheet.imageDataUrl}
                      alt=""
                      className="aspect-[4/3] h-full w-full object-contain"
                    />
                    {photo.generating ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                        <Loader2 className="h-6 w-6 animate-spin text-v2-primary" />
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={photo.generating || generateDisabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      onGenerateSheet(photo.id);
                    }}
                    className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-indigo-200 bg-indigo-50/20 px-2 text-center transition hover:bg-indigo-50/60 disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
                  >
                    {photo.generating ? (
                      <>
                        <Loader2 className="h-6 w-6 animate-spin text-v2-primary" />
                        <span className="text-[10px] font-medium text-v2-muted sm:text-xs">
                          Generating…
                        </span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5 text-v2-primary" />
                        <span className="text-[10px] font-semibold text-v2-primary sm:text-xs">
                          Generate sheet
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
