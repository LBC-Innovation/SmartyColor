"use client";

import { BookOpen, Loader2, Trash2, Users } from "lucide-react";
import { V2Modal, V2ModalActions, V2ModalBody } from "@/components/v2/ui/V2Modal";

type Props = {
  projectName: string;
  photoCount: number;
  /** People the album is shared with. Above zero, the modal warns that they lose access and their photos. */
  sharedCount?: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function V2DeleteProjectConfirmModal({
  projectName,
  photoCount,
  sharedCount = 0,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const photos = photoCount === 1 ? "1 photo" : `${photoCount} photos`;
  const people = sharedCount === 1 ? "1 person" : `${sharedCount} people`;

  return (
    <V2Modal
      onClose={() => !busy && onCancel()}
      maxWidthClass="max-w-lg"
      tone="danger"
      icon={<Trash2 />}
      title={`Delete “${projectName}”?`}
      description={
        <>
          This album and all <strong className="font-semibold text-v2-ink">{photos}</strong> in it, with their
          coloring pages, will be deleted for good.
        </>
      }
    >
      <V2ModalBody className="space-y-3">
        {sharedCount > 0 ? (
          <div
            role="alert"
            className="flex gap-3 rounded-2xl border-2 border-rose-500 bg-rose-50 px-4 py-3.5 text-rose-950"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white">
              <Users className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold">This album is shared with {people}.</p>
              <p className="mt-0.5 text-base leading-relaxed">
                {sharedCount === 1 ? "They" : "They all"} will lose access to it, and any photos they added will
                be <strong>deleted too</strong>.
              </p>
            </div>
          </div>
        ) : null}
        <div className="flex gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-950 ring-1 ring-amber-200">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <p className="text-base leading-relaxed">
            Any book you&apos;re still building with these photos will lose those pages.
          </p>
        </div>
        <p className="text-sm font-medium text-v2-muted">This can&apos;t be undone.</p>
      </V2ModalBody>

      <V2ModalActions>
        <button type="button" disabled={busy} onClick={onCancel} className="v2-modal-btn v2-modal-btn--secondary">
          Keep album
        </button>
        <button type="button" disabled={busy} onClick={onConfirm} className="v2-modal-btn v2-modal-btn--danger">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Trash2 className="h-5 w-5" aria-hidden />}
          Delete album
        </button>
      </V2ModalActions>
    </V2Modal>
  );
}
