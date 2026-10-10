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
import { V2SheetGeneratingPlaceholder } from "@/components/v2/V2SheetGeneratingPlaceholder";
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
  deleteMode?: boolean;
  deleteSelectedIds?: ReadonlySet<string>;
  onToggleDeleteSelect?: (id: string) => void;
  className?: string;
};

function PendingLibraryRow({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-dashed border-v2-primary/30 bg-v2-primary-light/80 p-2"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex h-9 w-6 shrink-0 items-center justify-center text-slate-300">
        <GripVertical className="h-4 w-4" aria-hidden />
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-v2-bg-subtle">
          <Loader2 className="h-6 w-6 animate-spin text-v2-primary" />
        </div>
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-v2-bg-subtle">
          <span className="text-[10px] font-medium text-v2-muted">Sheet</span>
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
  deleteMode?: boolean;
  deleteChecked?: boolean;
  onToggleDeleteSelect?: () => void;
  deleteSelectDisabled?: boolean;
  isOverlay?: boolean;
};

function PhotoLibraryRow({
  photo,
  isSelected,
  generateDisabled,
  onSelect,
  onGenerateSheet,
  dragHandleProps,
  deleteMode,
  deleteChecked,
  onToggleDeleteSelect,
  deleteSelectDisabled,
  isOverlay,
}: PhotoRowProps) {
  const rowSelect =
    deleteMode && !deleteSelectDisabled ? onToggleDeleteSelect : onSelect;

  return (
    <div
      onClick={rowSelect}
      className={cn(
        "rounded-xl border bg-v2-bg-subtle/40 p-2.5",
        deleteMode && deleteSelectDisabled
          ? "cursor-not-allowed opacity-70"
          : "cursor-pointer",
        deleteMode && deleteChecked
          ? "border-2 border-rose-400 bg-rose-50/30"
          : isSelected && !deleteMode
            ? "border-2 border-v2-primary"
            : "border border-gray-200 hover:border-slate-300",
        isOverlay &&
          "cursor-grabbing border-v2-primary bg-white shadow-lg shadow-v2-primary/25 ring-2 ring-v2-primary/20",
      )}
    >
      <div className="flex items-stretch gap-2">
        {deleteMode ? (
          <div
            className="flex w-6 shrink-0 items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={Boolean(deleteChecked)}
              disabled={deleteSelectDisabled}
              onChange={() => onToggleDeleteSelect?.()}
              aria-label={`Select page for deletion`}
              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        ) : (
          <button
            type="button"
            {...dragHandleProps}
            onClick={(event) => event.stopPropagation()}
            className="flex w-6 shrink-0 cursor-grab items-center justify-center rounded text-v2-muted hover:bg-v2-bg-subtle hover:text-v2-muted active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <div className="relative overflow-hidden rounded-lg bg-v2-bg-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.previewUrl}
              alt=""
              className="aspect-[4/3] h-full w-full object-cover"
            />
          </div>

          {photo.sheet ? (
            <div className="relative overflow-hidden rounded-lg border border-gray-100 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.sheet.imageDataUrl}
                alt=""
                className="aspect-[4/3] h-full w-full object-contain"
              />
              {photo.generating ? (
                <V2SheetGeneratingPlaceholder
                  imageSrc={photo.previewUrl}
                  className="absolute inset-0 rounded-lg"
                  imageFit="contain"
                  compact
                />
              ) : null}
            </div>
          ) : photo.generating ? (
            <V2SheetGeneratingPlaceholder
              imageSrc={photo.previewUrl}
              className="aspect-[4/3] rounded-lg border border-gray-200"
              imageFit="cover"
              compact
            />
          ) : (
            <button
              type="button"
              disabled={generateDisabled}
              onClick={(event) => {
                event.stopPropagation();
                onGenerateSheet();
              }}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-v2-primary/30 bg-v2-primary-light/60 px-2 text-center transition hover:bg-v2-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
            >
              <Sparkles className="h-5 w-5 text-v2-primary" />
              <span className="text-[10px] font-semibold text-v2-primary sm:text-xs">
                Generate sheet
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StaticPhotoRow(
  props: Omit<PhotoRowProps, "dragHandleProps" | "isOverlay">,
) {
  return <PhotoLibraryRow {...props} />;
}

function SortablePhotoRow({
  photo,
  isSelected,
  generateDisabled,
  onSelect,
  onGenerateSheet,
}: Omit<
  PhotoRowProps,
  "dragHandleProps" | "isOverlay" | "deleteMode" | "deleteChecked" | "onToggleDeleteSelect" | "deleteSelectDisabled"
>) {
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
  deleteMode,
  deleteSelectedIds,
  onToggleDeleteSelect,
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

  const pendingRows = pendingUploads.map((pending, index) => (
    <PendingLibraryRow
      key={pending.id}
      label={`Uploading photo ${index + 1} of ${pendingUploads.length}`}
    />
  ));

  if (deleteMode) {
    return (
      <div className={cn("flex flex-col gap-2.5 pr-0.5", className)}>
        {pendingRows}
        {photos.map((photo) => (
          <StaticPhotoRow
            key={photo.id}
            photo={photo}
            isSelected={photo.id === selectedId}
            generateDisabled={generateDisabled}
            deleteMode
            deleteChecked={deleteSelectedIds?.has(photo.id)}
            deleteSelectDisabled={photo.generating}
            onSelect={() => onSelect(photo.id)}
            onToggleDeleteSelect={() => onToggleDeleteSelect?.(photo.id)}
            onGenerateSheet={() => onGenerateSheet(photo.id)}
          />
        ))}
      </div>
    );
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
        {pendingRows}

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
