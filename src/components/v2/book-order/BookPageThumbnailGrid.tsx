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
import {
  ChevronLeft,
  ChevronRight,
  FlipHorizontal2,
  GripVertical,
  Loader2,
  Plus,
  RectangleVertical,
  Trash2,
} from "lucide-react";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import type {
  BookWizardBlankPage,
  BookWizardPage,
  BookWizardPhotoPage,
} from "@/lib/print/bookWizardTypes";
import { BookLinedPageArt } from "@/components/v2/book-order/BookLinedPageArt";
import { BookPageImageFill } from "@/components/v2/book-order/BookPageImageFill";
import { effectiveOrientation } from "@/lib/print/bookPagePlan";
import { cn } from "@/lib/cn";

type Props = {
  binding: BookBindingSpec;
  /** Every printed page in order, including blank and lined ones. */
  pages: BookWizardPage[];
  onReorder: (pages: BookWizardPage[]) => void;
  onMirrorPhoto: (pageId: string) => void;
  onRemovePage: (pageId: string) => void;
  onInsertBlank: () => void;
  onInsertLined: () => void;
  /** Redraw a landscape page as a portrait sheet. Omit to hide the button. */
  onMakePortrait?: (pageId: string) => void;
  /** Pages with an AI job running on them, and what it is doing. */
  busy?: Record<string, string>;
  /** Shown on the portrait button, e.g. what it costs. */
  portraitHint?: string;
};

const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed";

type TileProps = {
  index: number;
  count: number;
  onRemove?: () => void;
  onMove: (delta: -1 | 1) => void;
};

function DragHandle({ index, listeners, attributes }: {
  index: number;
  listeners: ReturnType<typeof useSortable>["listeners"];
  attributes: ReturnType<typeof useSortable>["attributes"];
}) {
  return (
    <button
      type="button"
      className="absolute right-1 top-1 inline-flex h-9 w-9 cursor-grab touch-none items-center justify-center rounded-lg bg-white/85 text-v2-muted shadow-sm backdrop-blur active:cursor-grabbing"
      {...attributes}
      {...listeners}
      aria-label={`Drag page ${index + 1}`}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}

function PageNumber({ index }: { index: number }) {
  return (
    <span className="absolute left-1.5 top-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
      {index + 1}
    </span>
  );
}

function TileFooter({
  index,
  count,
  onMove,
  onRemove,
  middle,
}: TileProps & { middle?: React.ReactNode }) {
  return (
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
      {middle}
      {onRemove ? (
        <button
          type="button"
          className={cn(ICON_BTN, "text-red-600 hover:bg-red-50")}
          onClick={onRemove}
          aria-label={`Remove page ${index + 1} from book`}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
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
  );
}

function SortablePhotoTile({
  page,
  binding,
  onMirror,
  onMakePortrait,
  portraitHint,
  busyLabel,
  ...tile
}: TileProps & {
  page: BookWizardPhotoPage;
  binding: BookBindingSpec;
  onMirror: () => void;
  onMakePortrait?: () => void;
  portraitHint?: string;
  busyLabel?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  // Landscape sheets are turned to portrait automatically; only those can be flipped.
  const landscape = effectiveOrientation(page) !== binding.requiredOrientation;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm",
        isDragging && "opacity-40",
      )}
    >
      <div className="relative aspect-[8.5/11] w-full bg-v2-bg-subtle">
        <BookPageImageFill page={page} binding={binding} />
        <PageNumber index={tile.index} />
        <DragHandle index={tile.index} listeners={listeners} attributes={attributes} />
        {landscape && onMakePortrait && !busyLabel ? (
          <button
            type="button"
            className="absolute inset-x-1.5 bottom-1.5 flex flex-col items-center rounded-md bg-amber-500/95 px-1.5 py-1 text-center text-[10px] font-semibold leading-tight text-white shadow-sm transition hover:bg-amber-600"
            onClick={onMakePortrait}
            title={portraitHint}
            aria-label={`Make page ${tile.index + 1} a portrait sheet`}
          >
            <span className="opacity-90">Landscape: rotated to fit</span>
            <span className="inline-flex items-center gap-1 underline underline-offset-2">
              <RectangleVertical className="h-3 w-3" aria-hidden />
              Make it portrait
            </span>
          </button>
        ) : landscape ? (
          <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
            Landscape: rotated to portrait
          </span>
        ) : null}
        {busyLabel ? <BusyOverlay label={busyLabel} /> : null}
      </div>
      <TileFooter
        {...tile}
        onRemove={tile.onRemove}
        middle={
          landscape ? (
            <button
              type="button"
              className={cn(
                ICON_BTN,
                page.mirrored
                  ? "bg-v2-primary-light text-v2-link"
                  : "text-v2-link hover:bg-v2-primary-light",
              )}
              onClick={onMirror}
              aria-pressed={Boolean(page.mirrored)}
              aria-label={`Flip page ${tile.index + 1} horizontally`}
              title="Flip horizontally"
            >
              <FlipHorizontal2 className="h-4 w-4" aria-hidden />
            </button>
          ) : null
        }
      />
    </div>
  );
}

export function BusyOverlay({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 px-3 text-center backdrop-blur-[1px]"
      role="status"
    >
      <Loader2 className="h-6 w-6 animate-spin text-v2-primary" aria-hidden />
      <span className="text-xs font-semibold text-v2-navy">{label}</span>
    </div>
  );
}

function BlankArt({ page }: { page: BookWizardBlankPage }) {
  if (page.variant === "lined") return <BookLinedPageArt />;
  return (
    <div className="flex h-full w-full items-center justify-center border border-dashed border-gray-300 bg-white">
      <span className="text-xs font-medium text-v2-muted">Blank</span>
    </div>
  );
}

function SortableBlankTile({ page, ...tile }: TileProps & { page: BookWizardBlankPage }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const lined = page.variant === "lined";
  const caption = lined ? "Lined page" : page.auto ? "Blank (added to fill the book)" : "Blank page";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm",
        page.auto ? "border-dashed border-gray-300" : "border-gray-200",
        isDragging && "opacity-40",
      )}
    >
      <div className="relative aspect-[8.5/11] w-full bg-white">
        <BlankArt page={page} />
        <PageNumber index={tile.index} />
        <DragHandle index={tile.index} listeners={listeners} attributes={attributes} />
        {lined || page.auto ? (
          <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-slate-700/80 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
            {caption}
          </span>
        ) : null}
      </div>
      <TileFooter {...tile} />
    </div>
  );
}

export function BookPageThumbnailGrid({
  binding,
  pages,
  onReorder,
  onMirrorPhoto,
  onRemovePage,
  onInsertBlank,
  onInsertLined,
  onMakePortrait,
  busy,
  portraitHint,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sortableIds = pages.map((p) => p.id);

  // Touch waits briefly so the grid still scrolls; mouse starts after a small move.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function movePage(id: string, delta: -1 | 1) {
    const from = pages.findIndex((p) => p.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= pages.length) return;
    onReorder(arrayMove(pages, from, to));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(pages, oldIndex, newIndex));
  }

  const activePage = pages.find((p) => p.id === activeId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="v2-btn-outline h-10 px-3" onClick={onInsertBlank}>
          <Plus className="h-4 w-4" aria-hidden />
          Insert blank page
        </button>
        <button type="button" className="v2-btn-outline h-10 px-3" onClick={onInsertLined}>
          <Plus className="h-4 w-4" aria-hidden />
          Insert lined page
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {pages.map((page, index) => {
              const tile = {
                index,
                count: pages.length,
                onMove: (delta: -1 | 1) => movePage(page.id, delta),
              };
              if (page.kind === "photo") {
                return (
                  <SortablePhotoTile
                    key={page.id}
                    {...tile}
                    page={page}
                    binding={binding}
                    onMirror={() => onMirrorPhoto(page.id)}
                    onMakePortrait={onMakePortrait ? () => onMakePortrait(page.id) : undefined}
                    portraitHint={portraitHint}
                    busyLabel={busy?.[page.id]}
                    onRemove={() => onRemovePage(page.id)}
                  />
                );
              }
              return (
                <SortableBlankTile
                  key={page.id}
                  {...tile}
                  page={page}
                  // Padding is required by the binding; only pages the user added can go.
                  onRemove={page.auto ? undefined : () => onRemovePage(page.id)}
                />
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay>
          {activePage ? (
            <div className="aspect-[8.5/11] w-36 overflow-hidden rounded-xl border-2 border-v2-primary bg-white shadow-lg">
              {activePage.kind === "photo" ? (
                <BookPageImageFill page={activePage} binding={binding} />
              ) : (
                <BlankArt page={activePage} />
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
