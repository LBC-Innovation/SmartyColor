"use client";

import { useRef, useState, type HTMLAttributes } from "react";
import { useGridGlide } from "@/components/v2/studio/useGridGlide";
import {
  DndContext,
  KeyboardSensor,
  closestCenter,
  type DragEndEvent,
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
  GalleryThumb,
  type CardState,
  type GalleryCardProps,
  type MoveTarget,
} from "@/components/v2/studio/GalleryCard";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";
import { ArrangeSheet, type ArrangeSession } from "@/components/v2/arrange/ArrangeSheet";
import { useArrangeLift, type ArrangeLiftInfo } from "@/components/v2/arrange/useArrangeLift";

const BROWSE: ArrangeSession = { mode: "browse" };

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
  /** The book panel is open: each finished page gets a check to keep it in or leave it out. */
  bookMode?: boolean;
  /** The toolbar's Arrange button opened the sheet (no page picked up yet). */
  arrangeOpen?: boolean;
  onArrangeClose?: () => void;
};

type ShareProps = Omit<
  GalleryCardProps,
  "dragListeners" | "keyboardHandle" | "lifted" | "isOverlay" | "style" | "nodeRef"
>;

function SortableCard({ onLift, ...props }: ShareProps & { onLift: (info: ArrangeLiftInfo) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.photo.id,
  });
  // A press-and-hold or drag on the card opens the Arrange sheet; dnd-kit only handles the keyboard,
  // through its own handle, so the card itself is not one big focusable "button" wrapped around other buttons.
  const { onKeyDown } = (listeners ?? {}) as Record<string, (e: unknown) => void>;
  const lift = useArrangeLift({ id: props.photo.id, onLift });
  return (
    <GalleryCard
      {...props}
      nodeRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      lifted={isDragging}
      dragListeners={lift as HTMLAttributes<HTMLElement>}
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
 * (desktop) a card to open the Arrange sheet, or use the card's ⋮ menu or the keyboard.
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
  bookMode = false,
  arrangeOpen = false,
  onArrangeClose,
}: Props) {
  const [lift, setLift] = useState<ArrangeSession | null>(null);
  const cardEls = useRef(new Map<string, HTMLElement>());
  const gridRef = useRef<HTMLDivElement>(null);
  useGridGlide(gridRef);
  const [hintSeen, setHintSeen] = useState(readHintSeen);
  // Pointer reordering lives in the Arrange sheet; here only the keyboard drags.
  const sensors = useSensors(useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

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

  function onLift(info: ArrangeLiftInfo) {
    if (!hintSeen) dismissHint();
    setLift({
      mode: "drag",
      activeId: info.id,
      pointerId: info.pointerId,
      pointerType: info.pointerType,
      x: info.x,
      y: info.y,
      originRect: info.originRect,
    });
  }

  function onSheetClose(movedId: string | null) {
    setLift(null);
    onArrangeClose?.();
    const el = movedId ? cardEls.current.get(movedId) : null;
    if (!el) return;
    // Wait a beat so the sheet has unmounted and page scroll is unlocked again.
    window.setTimeout(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      el.classList.remove("cm-just-moved");
      void el.offsetWidth;
      el.classList.add("cm-just-moved");
      window.setTimeout(() => el.classList.remove("cm-just-moved"), 1100);
    }, 60);
  }

  function onDragEnd(e: DragEndEvent) {
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

  function shared(photo: V2PhotoEntry, index: number): ShareProps {
    return {
      photo,
      index,
      count: photos.length,
      ...cardInfo(photo),
      selectMode,
      bookMode,
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
      onDragEnd={onDragEnd}
    >
      {showReorderHint && !hintSeen && photos.length >= 2 && !selectMode ? (
        <p className="mb-3 inline-flex max-w-full items-center gap-1 rounded-full bg-v2-primary-light py-1 pl-3 pr-1 text-xs font-semibold text-v2-navy">
          <span className="pointer-coarse:inline hidden">Press and hold a page to rearrange</span>
          <span className="pointer-coarse:hidden">Drag a page to rearrange</span>
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
            <div
              key={photo.id}
              role="listitem"
              ref={(el) => {
                if (el) cardEls.current.set(photo.id, el);
                else cardEls.current.delete(photo.id);
              }}
            >
              {selectMode ? (
                <GalleryCard {...shared(photo, index)} />
              ) : (
                <SortableCard {...shared(photo, index)} onLift={onLift} />
              )}
            </div>
          ))}
          {Array.from({ length: pendingUploads }, (_, i) => (
            <div key={`pending-${i}`} role="listitem">
              <GallerySkeletonCard />
            </div>
          ))}
        </div>
      </SortableContext>
      <ArrangeSheet
        items={photos}
        getId={(p) => p.id}
        renderThumb={(p) => <GalleryThumb photo={p} preferPage={cardInfo(p).state === "ready"} />}
        aspect={3 / 4}
        isMuted={(p) => cardInfo(p).leftOut}
        noun="page"
        session={selectMode ? null : (lift ?? (arrangeOpen ? BROWSE : null))}
        onCommit={onReorder}
        onClose={onSheetClose}
      />
    </DndContext>
  );
}

export type { CardState };
