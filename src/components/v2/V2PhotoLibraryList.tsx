"use client";

import {
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  className?: string;
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

type PhotoRowProps = {
  photo: V2LibraryPhoto;
  isSelected: boolean;
  generateDisabled?: boolean;
  onSelect: () => void;
  onGenerateSheet: () => void;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  isOverlay?: boolean;
};

function PhotoLibraryRow({
  photo,
  isSelected,
  generateDisabled,
  onSelect,
  onGenerateSheet,
  dragHandleProps,
  isOverlay,
}: PhotoRowProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "cursor-pointer rounded-xl border bg-v2-bg-subtle/40 p-2.5",
        isSelected
          ? "border-2 border-v2-primary"
          : "border border-slate-200/90 hover:border-slate-300",
        isOverlay &&
          "cursor-grabbing border-v2-primary bg-white shadow-lg shadow-indigo-300/30 ring-2 ring-v2-primary/20",
      )}
    >
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          {...dragHandleProps}
          onClick={(event) => event.stopPropagation()}
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
                onGenerateSheet();
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
}

function SortablePhotoRow({
  photo,
  isSelected,
  generateDisabled,
  onSelect,
  onGenerateSheet,
}: Omit<PhotoRowProps, "dragHandleProps" | "isOverlay">) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 0 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-40")}
    >
      <PhotoLibraryRow
        photo={photo}
        isSelected={isSelected}
        generateDisabled={generateDisabled}
        onSelect={onSelect}
        onGenerateSheet={onGenerateSheet}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
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
  className,
}: V2PhotoLibraryListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activePhoto = activeId
    ? photos.find((photo) => photo.id === activeId)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = photos.findIndex((photo) => photo.id === active.id);
    const newIndex = photos.findIndex((photo) => photo.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(photos, oldIndex, newIndex));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={cn("flex flex-col gap-2.5 pr-0.5", className)}>
        {pendingUploads.map((pending, index) => (
          <PendingLibraryRow
            key={pending.id}
            label={`Uploading photo ${index + 1} of ${pendingUploads.length}`}
          />
        ))}

        <SortableContext
          items={photos.map((photo) => photo.id)}
          strategy={verticalListSortingStrategy}
        >
          {photos.map((photo) => (
            <SortablePhotoRow
              key={photo.id}
              photo={photo}
              isSelected={photo.id === selectedId}
              generateDisabled={generateDisabled}
              onSelect={() => onSelect(photo.id)}
              onGenerateSheet={() => onGenerateSheet(photo.id)}
            />
          ))}
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={{ duration: 220, easing: "ease-out" }}>
        {activePhoto ? (
          <PhotoLibraryRow
            photo={activePhoto}
            isSelected={activePhoto.id === selectedId}
            generateDisabled={generateDisabled}
            onSelect={() => onSelect(activePhoto.id)}
            onGenerateSheet={() => onGenerateSheet(activePhoto.id)}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
