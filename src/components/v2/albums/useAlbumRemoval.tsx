"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { SIGNED_IN_HOME } from "@/components/v2/nav-config";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import { V2DeleteProjectConfirmModal } from "@/components/v2/V2DeleteProjectConfirmModal";
import { CancelPackageModal } from "@/components/v2/book-packages/CancelPackageModal";
import { V2Modal, V2ModalActions } from "@/components/v2/ui/V2Modal";
import { BOOK_PACKAGES } from "@/content/marketing";
import { isError } from "@/lib/api/client";
import { fetchPackageRefundQuote } from "@/lib/bookPackages/client";
import { fillPackageCopy } from "@/lib/bookPackages/copy";
import { notifyPackageChanged } from "@/lib/bookPackages/events";
import type { BookPackageRefundQuote } from "@/lib/bookPackages/types";
import { formatCredits } from "@/lib/credits/money";
import type { V2ProjectMeta } from "@/lib/v2/studioTypes";

/**
 * Deleting an album (or leaving one shared with you), shared by the album menu and the home page.
 * An album holding an unspent book package opens the cancel-and-refund dialog; every other album
 * gets the plain confirm. Removing the album that's open in the studio goes back to the home page,
 * without waiting for the next album to load. Render `modals` somewhere on the page.
 */
export function useAlbumRemoval({ onRemoved }: { onRemoved?: (project: V2ProjectMeta) => void } = {}) {
  const { cloud, activeProjectId, deleteProject } = useV2Studio();
  const toast = useV2Toast();
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<V2ProjectMeta | null>(null);
  const [pkgTarget, setPkgTarget] = useState<{ project: V2ProjectMeta; quote: BookPackageRefundQuote } | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<V2ProjectMeta | null>(null);
  const [busy, setBusy] = useState(false);

  /** Deletes it, and leaves the studio for home when it was the open album (guests have no home). */
  async function remove(target: V2ProjectMeta) {
    const goHome = cloud && target.id === activeProjectId;
    await deleteProject(target.id, { loadNextInBackground: goHome });
    onRemoved?.(target);
    if (goHome) router.push(SIGNED_IN_HOME);
  }

  async function requestDelete(project: V2ProjectMeta) {
    if (cloud && project.role !== "contributor") {
      const res = await fetchPackageRefundQuote(project.id);
      if (!isError(res) && res.data?.cancelable) {
        setPkgTarget({ project, quote: res.data });
        return;
      }
    }
    setDeleteTarget(project);
  }

  function requestLeave(project: V2ProjectMeta) {
    setLeaveTarget(project);
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    setBusy(true);
    try {
      await remove(target);
      setDeleteTarget(null);
      toast.success({ title: "Album deleted", message: `“${target.name}” and its photos were removed.` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the album.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmLeave() {
    const target = leaveTarget;
    if (!target) return;
    setBusy(true);
    try {
      await remove(target);
      setLeaveTarget(null);
      toast.success({ title: "You left the album", message: `“${target.name}” was removed from your list.` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not leave the album.");
    } finally {
      setBusy(false);
    }
  }

  async function onPackageCanceled(result: { refundCents: number; deleteAlbum: boolean }) {
    const target = pkgTarget?.project;
    if (!target) return;
    const refund = formatCredits(result.refundCents);
    notifyPackageChanged(target.id);
    if (!result.deleteAlbum) {
      setPkgTarget(null);
      toast.success({
        title: BOOK_PACKAGES.cancelDoneTitle,
        message: fillPackageCopy(BOOK_PACKAGES.cancelDoneBody, { refund }) ?? "",
      });
      return;
    }
    try {
      await remove(target);
      setPkgTarget(null);
      toast.success({
        title: BOOK_PACKAGES.cancelDoneTitle,
        message: fillPackageCopy(BOOK_PACKAGES.cancelDoneDeleted, { refund }) ?? "",
      });
    } catch {
      // The refund stands; the album stays as a normal album and can be deleted again.
      setPkgTarget(null);
      toast.error(fillPackageCopy(BOOK_PACKAGES.cancelDeleteFailed, { refund }) ?? "Could not delete the album.");
    }
  }

  const modals = (
    <>
      {pkgTarget ? (
        <CancelPackageModal
          albumId={pkgTarget.project.id}
          photoCount={pkgTarget.project.photoCount}
          initialChoice="delete"
          quote={pkgTarget.quote}
          onClose={() => setPkgTarget(null)}
          onCanceled={onPackageCanceled}
        />
      ) : null}

      {deleteTarget ? (
        <V2DeleteProjectConfirmModal
          projectName={deleteTarget.name}
          photoCount={deleteTarget.photoCount}
          sharedCount={deleteTarget.sharedCount}
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {leaveTarget ? (
        <V2Modal
          onClose={() => !busy && setLeaveTarget(null)}
          maxWidthClass="max-w-lg"
          tone="danger"
          icon={<LogOut />}
          title={`Leave “${leaveTarget.name}”?`}
          description={
            <>
              The album will disappear from your list. Photos you added stay in it for
              {leaveTarget.ownerName ? ` ${leaveTarget.ownerName}` : " its owner"}, who can invite you again later.
            </>
          }
        >
          <V2ModalActions>
            <button
              type="button"
              disabled={busy}
              onClick={() => setLeaveTarget(null)}
              className="v2-modal-btn v2-modal-btn--secondary"
            >
              Stay in album
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmLeave()}
              className="v2-modal-btn v2-modal-btn--danger"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
              Leave album
            </button>
          </V2ModalActions>
        </V2Modal>
      ) : null}
    </>
  );

  return { requestDelete, requestLeave, modals };
}
