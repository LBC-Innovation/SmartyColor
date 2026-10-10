"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

type V2DeletePagesConfirmModalProps = {
  open: boolean;
  pageCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export function V2DeletePagesConfirmModal({
  open,
  pageCount,
  onConfirm,
  onCancel,
  busy,
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

  const noun = pageCount === 1 ? "page" : "pages";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 sm:p-6"
      role="dialog"
      aria-labelledby="v2-delete-pages-title"
      aria-describedby="v2-delete-pages-desc"
      aria-modal="true"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl shadow-slate-900/20"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="v2-delete-pages-title"
              className="text-lg font-semibold text-v2-ink"
            >
              Permanently delete {pageCount} {noun}?
            </h2>
            <p id="v2-delete-pages-desc" className="mt-2 text-sm leading-relaxed text-v2-muted">
              All photos and coloring sheets for{" "}
              {pageCount === 1 ? "this page" : "these pages"} will be permanently
              deleted. This action cannot be undone and content cannot be restored.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            Permanently delete
          </button>
        </div>
      </div>
    </div>
  );
}
