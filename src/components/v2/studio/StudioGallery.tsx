"use client";

import { useRef, useState, type HTMLAttributes } from "react";
import { useGridGlide } from "@/components/v2/studio/useGridGlide";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  type Announcements,
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
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  GalleryCard,
  GallerySkeletonCard,
  type CardState,
  type GalleryCardProps,
  type MoveTarget,
} from "@/components/v2/studio/GalleryCard";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";

const HINT_KEY = "cm_reorder_hint_seen";

type CardInfo = Pick<GalleryCardProps, "state" | "bookNumber" | "leftOut" | "failureMessage">;

type Props = {
  photos: V2PhotoEntry[];
  pendingUploads: number;
  cardInfo: (photo: V2PhotoEntry) => CardInfo;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string, view: "page" | "photo") => void;
  onMake: (id: string) => void;
  onCancel: (id: string) => void;
  onToggleLeftOut: (id: string) => void;
  onDelete: (id: string) => void;
  /** Print, download or send a finished page. */
  onPrint: (id: string) => void;
  onReorder: (next: V2PhotoEntry[]) => void;
  /** False when something else already explains reordering (the book's own tip). */
  showReorderHint?: boolean;
};

type ShareProps = Omit<
  GalleryCardProps,
  "dragListeners" | "keyboardHandle" | "lifted" | "isOverlay" | "style" | "nodeRef"
>;

function SortableCard(props: ShareProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.photo.id,
  });
  // Pointer and touch start a drag from anywhere on the card; the keyboard uses its own handle,
  // so the card itself is not one big focusable "button" wrapped around other buttons.
  const { onKeyDown, ...pointerListeners } = (listeners ?? {}) as Record<string, (e: unknown) => void>;
  return (
    <GalleryCard
      {...props}
      nodeRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      lifted={isDragging}
      dragListeners={pointerListeners as HTMLAttributes<HTMLElement>}
      keyboardHandle={{
        ...(attributes as unknown as HTMLAttributes<HTMLButtonElement>),
        onKeyDown: onKeyDown as HTMLAttributes<HTMLButtonElement>["onKeyDown"],
        ref: setActivatorNodeRef,
      }}
    />
  );
}

function readHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * The album as a grid of cards. The gallery order is the book order: long-press (phones) or drag
 * (desktop) to move a card, or use the card's ⋮ menu.
 */
export function StudioGallery({
  photos,
  pendingUploads,
  cardInfo,
  selectMode,
  selectedIds,
  onToggleSelect,
  onOpen,
  onMake,
  onCancel,
  onToggleLeftOut,
  onDelete,
  onPrint,
  onReorder,
  showReorderHint = true,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useGridGlide(gridRef);
  const [hintSeen, setHintSeen] = useState(readHintSeen);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press to lift, so a normal scroll never starts a drag.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function dismissHint() {
    setHintSeen(true);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  const position = (id: string | number) => photos.findIndex((p) => p.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up photo ${position(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `Photo ${position(active.id)} is over position ${position(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Photo ${position(active.id)} moved to position ${position(over.id)}.` : `Photo dropped.`,
    onDragCancel: ({ active }) => `Moving photo ${position(active.id)} was cancelled.`,
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    navigator.vibrate?.(10);
    if (!hintSeen) dismissHint();
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = photos.findIndex((p) => p.id === active.id);
    const to = photos.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(photos, from, to));
  }

  function move(id: string, target: MoveTarget) {
    const from = photos.findIndex((p) => p.id === id);
    if (from < 0) return;
    const to =
      target === "start" ? 0 : target === "end" ? photos.length - 1 : target === "earlier" ? from - 1 : from + 1;
    if (to < 0 || to >= photos.length || to === from) return;
    onReorder(arrayMove(photos, from, to));
  }

  const activePhoto = activeId ? photos.find((p) => p.id === activeId) : null;

  function shared(photo: V2PhotoEntry, index: number): ShareProps {
    return {
      photo,
      index,
      count: photos.length,
      ...cardInfo(photo),
      selectMode,
      selected: selectedIds.has(photo.id),
      onToggleSelect: () => onToggleSelect(photo.id),
      onOpen: (view) => onOpen(photo.id, view),
      onMake: () => onMake(photo.id),
      onCancel: () => onCancel(photo.id),
      onMove: (to) => move(photo.id, to),
      onToggleLeftOut: () => onToggleLeftOut(photo.id),
      onDelete: () => onDelete(photo.id),
      onPrint: () => onPrint(photo.id),
    };
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements }}
      autoScroll
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {showReorderHint && !hintSeen && photos.length >= 2 && !selectMode ? (
        <p className="mb-3 inline-flex max-w-full items-center gap-1 rounded-full bg-v2-primary-light py-1 pl-3 pr-1 text-xs font-semibold text-v2-navy">
          <span className="pointer-coarse:inline hidden">Press and hold a photo to change the order</span>
          <span className="pointer-coarse:hidden">Drag photos to change the order</span>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/70"
            aria-label="Dismiss tip"
            onClick={dismissHint}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </p>
      ) : null}
      <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div
          ref={gridRef}
          className={cn(
            "grid gap-3 lg:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]",
            // One page so far: a single big centered column below lg, so the first page is easy to see.
            photos.length + pendingUploads === 1
              ? "mx-auto max-w-[17rem] grid-cols-1 lg:mx-0 lg:max-w-none"
              : "grid-cols-2 sm:grid-cols-3",
          )}
          aria-label="Your photos and coloring pages"
          role="list"
        >
          {photos.map((photo, index) => (
            <div key={photo.id} role="listitem">
              {selectMode ? <GalleryCard {...shared(photo, index)} /> : <SortableCard {...shared(photo, index)} />}
            </div>
          ))}
          {Array.from({ length: pendingUploads }, (_, i) => (
            <div key={`pending-${i}`} role="listitem">
              <GallerySkeletonCard />
            </div>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activePhoto ? (
          <GalleryCard {...shared(activePhoto, photos.findIndex((p) => p.id === activePhoto.id))} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export type { CardState };
