"use client";

import { useState } from "react";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FlipHorizontal2, GripVertical, Trash2 } from "lucide-react";
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

function SortablePhotoTile({
  page,
  index,
  binding,
  onFlip,
  onRemove,
}: {
  page: BookWizardPhotoPage;
  index: number;
  binding: BookBindingSpec;
  onFlip: () => void;
  onRemove: () => void;
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
        "relative flex flex-col rounded-xl border bg-white p-2 shadow-sm",
        isDragging && "opacity-40",
        portraitOk ? "border-gray-200" : "border-amber-400 ring-1 ring-amber-200",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <button
          type="button"
          className="cursor-grab rounded p-0.5 text-v2-muted hover:bg-v2-bg-subtle active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Drag page ${index + 1}`}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        <span className="text-[10px] font-bold tabular-nums text-v2-muted">{index + 1}</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="rounded p-0.5 text-v2-link hover:bg-v2-primary-light"
            onClick={onFlip}
            title={`Flip page ${index + 1}`}
            aria-label={`Flip page ${index + 1}`}
          >
            <FlipHorizontal2 className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className="rounded p-0.5 text-red-600 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove page ${index + 1} from book`}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="relative aspect-[8.5/11] w-full overflow-hidden rounded-lg bg-v2-bg-subtle">
        <BookPageImageFill page={page} binding={binding} className="rounded-lg" />
      </div>
      {!portraitOk ? (
        <p className="mt-1 text-center text-[10px] font-semibold text-amber-800">Flip for portrait</p>
      ) : null}
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {pages.map((page, index) =>
            page.kind === "photo" ? (
              <SortablePhotoTile
                key={page.id}
                page={page}
                index={index}
                binding={binding}
                onFlip={() => onFlipPhoto(page.id)}
                onRemove={() => onRemovePhoto(page.id)}
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
