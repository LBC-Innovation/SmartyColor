"use client";

import { useState, type ReactNode } from "react";
import { V2DeletePagesConfirmModal } from "@/components/v2/V2DeletePagesConfirmModal";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import { withViewTransition } from "@/lib/v2/viewTransition";

export type V2LibraryDeletion = {
  /** The photo list is showing checkboxes instead of drag handles. */
  active: boolean;
  selectedIds: ReadonlySet<string>;
  deletableCount: number;
  allSelected: boolean;
  enter: () => void;
  exit: () => void;
  toggle: (id: string) => void;
  toggleAll: () => void;
  /** Ask before permanently deleting these pages. */
  request: (ids: string[]) => void;
  requestSelected: () => void;
  /** The confirm dialog; render it once near the page root. */
  modal: ReactNode;
};

/**
 * "Delete pages" mode for the photo library: pick pages in the sidebar,
 * confirm, remove. Pages still generating, and photos other people added to
 * a shared album, are never deleted.
 */
export function useV2LibraryDeletion(): V2LibraryDeletion {
  const { photos, photosRef, removePhotosByIds } = useV2Studio();
  const toast = useV2Toast();
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deletableIds = photos.filter((p) => !p.generating).map((p) => p.id);
  const allSelected =
    deletableIds.length > 0 && deletableIds.every((id) => selectedIds.has(id));

  function enter() {
    withViewTransition(() => {
      setSelectedIds(new Set());
      setActive(true);
    });
  }

  function exit() {
    withViewTransition(() => {
      setActive(false);
      setSelectedIds(new Set());
    });
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(deletableIds));
  }

  function request(ids: string[]) {
    if (ids.length === 0) return;
    setPendingIds(ids);
    setConfirmOpen(true);
  }

  function cancel() {
    setConfirmOpen(false);
    setPendingIds([]);
  }

  function confirm() {
    const locked = new Set(
      photosRef.current.filter((entry) => entry.canDelete === false).map((entry) => entry.id),
    );
    const ids = pendingIds.filter((id) => !locked.has(id));
    const skipped = pendingIds.length - ids.length;
    setConfirmOpen(false);
    setPendingIds([]);
    if (ids.length === 0) {
      if (skipped > 0) {
        toast.error("Only the person who added a photo, or the album's owner, can delete it.");
      }
      return;
    }
    removePhotosByIds(ids);
    exit();
    toast.success({
      message:
        ids.length === 1
          ? "Page permanently deleted."
          : `${ids.length} pages permanently deleted.`,
    });
    if (skipped > 0) {
      toast.info(
        skipped === 1
          ? "1 photo was added by someone else and was kept."
          : `${skipped} photos were added by other people and were kept.`,
      );
    }
  }

  return {
    active,
    selectedIds,
    deletableCount: deletableIds.length,
    allSelected,
    enter,
    exit,
    toggle,
    toggleAll,
    request,
    requestSelected: () => request([...selectedIds]),
    modal: (
      <V2DeletePagesConfirmModal
        open={confirmOpen}
        pageCount={pendingIds.length}
        onConfirm={confirm}
        onCancel={cancel}
      />
    ),
  };
}
