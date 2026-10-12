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
  MouseSensor,
  TouchSensor,
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
import { ChevronDown, ChevronUp, GripVertical, Loader2, Sparkles } from "lucide-react";
import { V2SheetGeneratingPlaceholder } from "@/components/v2/V2SheetGeneratingPlaceholder";
import { cn } from "@/lib/cn";
import type { GeneratedSheet } from "@/lib/session/types";
import type { PrintPrefs } from "@/lib/print/settings";
import { photoThumbObjectPosition, type V2PhotoImageMeta } from "@/lib/v2/studioTypes";

export type V2LibraryPhoto = {
  id: string;
  previewUrl: string;
  photoDataUrl: string;
  image?: V2PhotoImageMeta;
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
  /** Touch-friendly reorder: shown instead of the drag grip below lg. */
  onMove?: (delta: -1 | 1) => void;
  isFirst?: boolean;
  isLast?: boolean;
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
  onMove,
  isFirst,
  isLast,
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
          <div className="flex w-10 shrink-0 flex-col items-center justify-center lg:w-7">
            {onMove ? (
              <div className="flex flex-col gap-0.5 lg:hidden">
                <button
                  type="button"
                  disabled={isFirst}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(-1);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-25"
                  aria-label="Move photo up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={isLast}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(1);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-25"
                  aria-label="Move photo down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            <button
              type="button"
              {...dragHandleProps}
              onClick={(event) => event.stopPropagation()}
              className={cn(
                "h-9 w-7 cursor-grab touch-none items-center justify-center rounded text-v2-muted hover:bg-v2-bg-subtle active:cursor-grabbing",
                onMove ? "hidden lg:flex" : "flex",
              )}
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <div
            role="img"
            aria-label=""
            className="aspect-[4/3] rounded-lg bg-v2-bg-subtle bg-cover bg-no-repeat"
            style={{
              backgroundImage: `url("${photo.previewUrl}")`,
              backgroundPosition:
                photoThumbObjectPosition(photo) === "top" ? "center top" : "center center",
            }}
          />

          {photo.sheet ? (
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-gray-100 bg-white">
              {/* Background image, scaled a touch past the frame so the sheet's own black border is cropped */}
              <div
                role="img"
                aria-label=""
                className="absolute -inset-[3%] bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url("${photo.sheet.imageDataUrl}")` }}
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
  onMove,
  isFirst,
  isLast,
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
        onMove={onMove}
        isFirst={isFirst}
        isLast={isLast}
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
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function movePhoto(id: string, delta: -1 | 1) {
    const from = photos.findIndex((photo) => photo.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= photos.length) return;
    onReorder(arrayMove(photos, from, to));
  }

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
          {photos.map((photo, index) => (
            <SortablePhotoRow
              key={photo.id}
              photo={photo}
              isSelected={photo.id === selectedId}
              generateDisabled={generateDisabled}
              onSelect={() => onSelect(photo.id)}
              onGenerateSheet={() => onGenerateSheet(photo.id)}
              onMove={(delta) => movePhoto(photo.id, delta)}
              isFirst={index === 0}
              isLast={index === photos.length - 1}
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
