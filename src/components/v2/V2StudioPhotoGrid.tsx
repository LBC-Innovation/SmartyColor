"use client";

import { useState, type CSSProperties } from "react";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, GripVertical, Loader2, Sparkles } from "lucide-react";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";
import { photoThumbObjectPosition } from "@/lib/v2/studioTypes";
import { cn } from "@/lib/cn";

type Props = {
  photos: V2PhotoEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (next: V2PhotoEntry[]) => void;
  className?: string;
};

function Tile({
  photo,
  index,
  count,
  selected,
  onSelect,
  onMove,
  dragHandle,
  isOverlay,
}: {
  photo: V2PhotoEntry;
  index: number;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onMove?: (delta: -1 | 1) => void;
  dragHandle?: React.HTMLAttributes<HTMLButtonElement>;
  isOverlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border-2 bg-white shadow-sm transition",
        selected ? "border-v2-primary ring-2 ring-v2-primary/20" : "border-gray-200 hover:border-v2-primary/40",
        isOverlay && "cursor-grabbing border-v2-primary shadow-lg shadow-v2-primary/25",
      )}
    >
      <button type="button" onClick={onSelect} className="relative block aspect-[4/3] w-full bg-v2-bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.previewUrl}
          alt=""
          className={cn(
            "h-full w-full object-cover",
            photoThumbObjectPosition(photo) === "top" ? "object-top" : "object-center",
          )}
        />
        <span className="absolute left-1.5 top-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
          {index + 1}
        </span>
        {photo.sheet ? (
          <span className="absolute bottom-1.5 right-1.5 h-12 w-12 overflow-hidden rounded-md border-2 border-white bg-white shadow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.sheet.imageDataUrl} alt="" className="h-full w-full object-contain" />
          </span>
        ) : photo.generating ? (
          <span className="absolute bottom-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-v2-primary shadow">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          </span>
        ) : (
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-v2-primary shadow">
            <Sparkles className="h-3 w-3" aria-hidden />
            No sheet
          </span>
        )}
      </button>

      {dragHandle ? (
        <span
          className="absolute right-1 top-1 hidden h-8 w-8 cursor-grab items-center justify-center rounded-lg bg-white/85 text-v2-muted shadow-sm backdrop-blur lg:inline-flex"
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </span>
      ) : null}

      {onMove ? (
        <div className="flex items-center justify-between border-t border-gray-100 px-1 py-0.5 lg:hidden">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="inline-flex h-8 w-9 items-center justify-center rounded-md text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-25"
            aria-label={`Move photo ${index + 1} earlier`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            className="inline-flex h-8 w-9 items-center justify-center rounded-md text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-25"
            aria-label={`Move photo ${index + 1} later`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SortableTile(props: Omit<Parameters<typeof Tile>[0], "dragHandle" | "isOverlay" | "onMove">) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.photo.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return (
    // Hold-to-drag anywhere on the tile (touch) or drag outright (mouse); a plain tap still selects.
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("select-none", isDragging && "opacity-40")}
    >
      <Tile {...props} dragHandle={{}} />
    </div>
  );
}

/** All photos in a responsive grid; drag (desktop) or ◀ ▶ (touch) to reorder, tap to select. */
export function V2StudioPhotoGrid({ photos, selectedId, onSelect, onReorder, className }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = photos.findIndex((p) => p.id === active.id);
    const to = photos.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(photos, from, to));
  }

  const activePhoto = activeId ? photos.find((p) => p.id === activeId) : null;

  if (photos.length === 0) {
    return (
      <div className={cn("flex flex-1 items-center justify-center text-sm text-v2-muted", className)}>
        Upload photos to see them here.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <p className="mb-2 text-xs text-v2-muted lg:hidden">Hold a photo, then drag to reorder. Tap to select.</p>
      <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
        {/* Column count follows the available width: as many 9–11rem tiles as fit. */}
        <div
          className={cn(
            "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(9rem,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]",
            className,
          )}
        >
          {photos.map((photo, index) => (
            <SortableTile
              key={photo.id}
              photo={photo}
              index={index}
              count={photos.length}
              selected={photo.id === selectedId}
              onSelect={() => onSelect(photo.id)}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activePhoto ? (
          <div className="w-44">
            <Tile
              photo={activePhoto}
              index={photos.findIndex((p) => p.id === activePhoto.id)}
              count={photos.length}
              selected={activePhoto.id === selectedId}
              onSelect={() => undefined}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
