"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";

type Props = {
  projectName: string;
  photoCount: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function V2DeleteProjectConfirmModal({
  projectName,
  photoCount,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const photos = photoCount === 1 ? "1 photo" : `${photoCount} photos`;

  return (
    <V2Modal onClose={() => !busy && onCancel()} maxWidthClass="max-w-md">
      <div className="p-6">
        <div className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-v2-ink">
              Delete “{projectName}”?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-v2-muted">
              This album and all {photos} in it — including their coloring sheets and
              revisions — will be permanently deleted.
            </p>
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
              Any book you&apos;re still building that uses these photos will lose those
              pages from its page set.
            </p>
            <p className="mt-2 text-xs text-v2-muted">This can&apos;t be undone.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            Keep album
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Delete album
          </button>
        </div>
      </div>
    </V2Modal>
  );
}
