"use client";

import { useState } from "react";
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
import { ChevronLeft, ChevronRight, GripVertical, RotateCw, Trash2 } from "lucide-react";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import type { BookWizardPage, BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import { BookPageImageFill } from "@/components/v2/book-order/BookPageImageFill";
import { effectiveOrientation } from "@/lib/print/bookPagePlan";
import { cn } from "@/lib/cn";

type Props = {
  binding: BookBindingSpec;
  pages: BookWizardPage[];
  onReorder: (pages: BookWizardPage[]) => void;
  onFlipPhoto: (pageId: string) => void;
  onRemovePhoto: (pageId: string) => void;
};

const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed";

function SortablePhotoTile({
  page,
  index,
  count,
  binding,
  onFlip,
  onRemove,
  onMove,
}: {
  page: BookWizardPhotoPage;
  index: number;
  count: number;
  binding: BookBindingSpec;
  onFlip: () => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const portraitOk = effectiveOrientation(page) === binding.requiredOrientation;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm",
        isDragging && "opacity-40",
        portraitOk ? "border-gray-200" : "border-amber-400 ring-1 ring-amber-200",
      )}
    >
      <div className="relative aspect-[8.5/11] w-full bg-v2-bg-subtle">
        <BookPageImageFill page={page} binding={binding} />
        <span className="absolute left-1.5 top-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
          {index + 1}
        </span>
        <button
          type="button"
          className="absolute right-1 top-1 inline-flex h-9 w-9 cursor-grab touch-none items-center justify-center rounded-lg bg-white/85 text-v2-muted shadow-sm backdrop-blur active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Drag page ${index + 1}`}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        {!portraitOk ? (
          <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
            Rotate to portrait
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 px-1 py-0.5">
        <button
          type="button"
          className={cn(ICON_BTN, "text-v2-navy hover:bg-v2-bg-subtle")}
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label={`Move page ${index + 1} earlier`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={cn(ICON_BTN, "text-v2-link hover:bg-v2-primary-light")}
          onClick={onFlip}
          aria-label={`Rotate page ${index + 1}`}
        >
          <RotateCw className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={cn(ICON_BTN, "text-red-600 hover:bg-red-50")}
          onClick={onRemove}
          aria-label={`Remove page ${index + 1} from book`}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={cn(ICON_BTN, "text-v2-navy hover:bg-v2-bg-subtle")}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          aria-label={`Move page ${index + 1} later`}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function BlankTile({ index }: { index: number }) {
  return (
    <div className="flex flex-col rounded-xl border border-dashed border-gray-300 bg-v2-bg-subtle/80 p-2">
      <span className="mb-1 text-[10px] font-bold tabular-nums text-v2-muted">{index + 1}</span>
      <div className="flex aspect-[8.5/11] w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white">
        <span className="text-xs font-medium text-v2-muted">Blank</span>
      </div>
    </div>
  );
}

export function BookPageThumbnailGrid({
  binding,
  pages,
  onReorder,
  onFlipPhoto,
  onRemovePhoto,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const photoPages = pages.filter((p): p is BookWizardPhotoPage => p.kind === "photo");
  const blankPages = pages.filter((p) => p.kind === "blank");
  const sortableIds = photoPages.map((p) => p.id);

  // Touch waits briefly so the grid still scrolls; mouse starts after a small move.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function movePhoto(id: string, delta: -1 | 1) {
    const from = photoPages.findIndex((p) => p.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= photoPages.length) return;
    onReorder([...arrayMove(photoPages, from, to), ...blankPages]);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = photoPages.findIndex((p) => p.id === active.id);
    const newIndex = photoPages.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(photoPages, oldIndex, newIndex);
    onReorder([...reordered, ...blankPages]);
  }

  const activePhoto = photoPages.find((p) => p.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {pages.map((page, index) =>
            page.kind === "photo" ? (
              <SortablePhotoTile
                key={page.id}
                page={page}
                index={index}
                count={photoPages.length}
                binding={binding}
                onFlip={() => onFlipPhoto(page.id)}
                onRemove={() => onRemovePhoto(page.id)}
                onMove={(delta) => movePhoto(page.id, delta)}
              />
            ) : (
              <BlankTile key={page.id} index={index} />
            ),
          )}
        </div>
      </SortableContext>
      <DragOverlay>
        {activePhoto ? (
          <div className="aspect-[8.5/11] w-36 overflow-hidden rounded-xl border-2 border-v2-primary bg-white shadow-lg">
            <BookPageImageFill page={activePhoto} binding={binding} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
