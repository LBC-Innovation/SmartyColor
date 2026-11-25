"use client";

import { useEffect } from "react";
import { Trash2 } from "lucide-react";
import { V2ModalActions } from "@/components/v2/ui/V2Modal";

type V2DeletePagesConfirmModalProps = {
  open: boolean;
  pageCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** A plain note under the question (a package album's included slot stays used). */
  note?: string | null;
};

export function V2DeletePagesConfirmModal({
  open,
  pageCount,
  onConfirm,
  onCancel,
  busy,
  note,
}: V2DeletePagesConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open || pageCount < 1) return null;

  const noun = pageCount === 1 ? "photo" : "photos";

  return (
    <div
      className="v2-modal fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-labelledby="v2-delete-pages-title"
      aria-describedby="v2-delete-pages-desc"
      aria-modal="true"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        className="v2-modal-backdrop absolute inset-0 bg-v2-plum/50 backdrop-blur-sm"
        onClick={() => !busy && onCancel()}
      />
      <div className="v2-modal-panel relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-[1.75rem] bg-white ring-1 ring-v2-primary/10">
        <div className="v2-modal-strip v2-modal-strip--danger h-1.5 w-full" aria-hidden />
        <div className="v2-modal-head flex gap-4 px-5 pb-2 pt-5 sm:px-7 sm:pt-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-coral to-brand-pink text-white shadow-lg shadow-brand-pink/30">
            <Trash2 className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="v2-delete-pages-title" className="v2-brand-title text-[1.5rem] leading-tight text-v2-ink">
              Permanently delete {pageCount} {noun}?
            </h2>
            <p id="v2-delete-pages-desc" className="mt-1.5 text-base leading-relaxed text-v2-muted">
              {pageCount === 1 ? "This photo and its coloring page" : "These photos and their coloring pages"}{" "}
              will be deleted for good. This can&apos;t be undone.
            </p>
            {note ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{note}</p>
            ) : null}
          </div>
        </div>

        <V2ModalActions className="pt-5">
          <button type="button" disabled={busy} onClick={onCancel} className="v2-modal-btn v2-modal-btn--secondary">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className="v2-modal-btn v2-modal-btn--danger">
            <Trash2 className="h-5 w-5" aria-hidden />
            Delete {pageCount === 1 ? "photo" : `${pageCount} photos`}
          </button>
        </V2ModalActions>
      </div>
    </div>
  );
}
