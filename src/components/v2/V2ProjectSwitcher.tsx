"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Users } from "lucide-react";
import { SIGNED_IN_HOME } from "@/components/v2/nav-config";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { AlbumSwitcherPanel, AlbumThumb } from "@/components/v2/albums/AlbumSwitcherPanel";
import { V2DeleteProjectConfirmModal } from "@/components/v2/V2DeleteProjectConfirmModal";
import { V2ShareAlbumModal } from "@/components/v2/V2ShareAlbumModal";
import { V2SendToFamilyModal } from "@/components/v2/share/V2SendToFamilyModal";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useV2Toast } from "@/components/v2/V2Toast";
import * as library from "@/lib/library/client";
import { cn } from "@/lib/cn";
import type { V2ProjectMeta } from "@/lib/v2/studioTypes";

/**
 * Album title + switcher for the page header. One pill shows the open album; it opens a panel
 * (bottom sheet on phones, popover from `sm`) that lists albums and holds every album action:
 * open, rename, share, send pages, delete or leave.
 */
export function V2ProjectSwitcher({ className }: { className?: string }) {
  const {
    hydrated,
    cloud,
    projects,
    activeProject,
    activeProjectId,
    photos,
    createProject,
    switchProject,
    renameProject,
    deleteProject,
    setProjectSharedCount,
  } = useV2Studio();
  const toast = useV2Toast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<V2ProjectMeta | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<V2ProjectMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<V2ProjectMeta | null>(null);
  const [sendingToFamily, setSendingToFamily] = useState<V2ProjectMeta | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sharedWithMe = activeProject?.role === "contributor";

  const close = useCallback(() => setOpen(false), []);

  // Album thumbnails: fetched once, the first time the panel opens (signing thumbnails for every
  // album is too heavy to do on every page load). Signed-in only; guests get letter tiles.
  const coversLoaded = useRef(false);
  useEffect(() => {
    if (!open || !cloud || coversLoaded.current) return;
    coversLoaded.current = true;
    let cancelled = false;
    void library.listProjects({ previews: true }).then((res) => {
      if (cancelled || res.error || !res.data) {
        coversLoaded.current = false;
        return;
      }
      const next: Record<string, string> = {};
      for (const p of res.data) if (p.previewUrls?.[0]) next[p.id] = p.previewUrls[0];
      setCovers(next);
    });
    return () => {
      cancelled = true;
      coversLoaded.current = false;
    };
  }, [open, cloud]);

  const coverFor = useCallback(
    (project: V2ProjectMeta): string | null =>
      covers[project.id] ??
      project.coverUrl ??
      (project.id === activeProjectId ? (photos[0]?.previewUrl ?? null) : null),
    [covers, activeProjectId, photos],
  );

  async function confirmDeleteProject() {
    const target = deleteTarget;
    if (!target) return;
    const wasActive = target.id === activeProjectId;
    setBusy(true);
    try {
      await deleteProject(target.id);
      setDeleteTarget(null);
      toast.success({ title: "Album deleted", message: `“${target.name}” and its photos were removed.` });
      // Back to the albums at home; guests have no home page, so they stay in the studio.
      if (cloud && wasActive) router.push(SIGNED_IN_HOME);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the album.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmLeaveAlbum() {
    const target = leaveTarget;
    if (!target) return;
    setBusy(true);
    try {
      await deleteProject(target.id);
      setLeaveTarget(null);
      toast.success({ title: "You left the album", message: `“${target.name}” was removed from your list.` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not leave the album.");
    } finally {
      setBusy(false);
    }
  }

  const label = !hydrated ? "Loading…" : (activeProject?.name ?? "Select an album");

  return (
    <div ref={rootRef} className={cn("relative flex min-w-0 flex-1 items-center sm:w-80 sm:flex-none", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={!hydrated}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={activeProject ? `Album: ${activeProject.name}, switch or manage albums` : "Choose an album"}
        title={activeProject?.name}
        className="v2-hit inline-flex min-h-11 w-full min-w-0 items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1.5 pr-3 text-left shadow-sm transition hover:border-v2-primary/40 hover:bg-v2-bg-subtle disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:min-h-0"
      >
        <AlbumThumb name={activeProject?.name ?? ""} url={activeProject ? coverFor(activeProject) : null} size="sm" />
        {sharedWithMe ? (
          <Users className="h-4 w-4 shrink-0 text-v2-primary" aria-label="Shared with you" />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-v2-ink">{label}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-v2-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <AlbumSwitcherPanel
          triggerRef={triggerRef}
          projects={projects}
          activeProjectId={activeProjectId}
          cloud={cloud}
          coverFor={coverFor}
          onClose={close}
          onCreate={() => {
            setOpen(false);
            createProject();
          }}
          onSwitch={(id) => {
            setOpen(false);
            switchProject(id);
          }}
          onRename={(id, name) => {
            renameProject(id, name);
            toast.success({ title: "Album renamed", message: `Now called “${name.trim()}”.` });
          }}
          onShare={(p) => {
            setOpen(false);
            setSharing(p);
          }}
          onSendToFamily={(p) => {
            setOpen(false);
            setSendingToFamily(p);
          }}
          onDelete={(p) => {
            setOpen(false);
            setDeleteTarget(p);
          }}
          onLeave={(p) => {
            setOpen(false);
            setLeaveTarget(p);
          }}
        />
      ) : null}

      {deleteTarget ? (
        <V2DeleteProjectConfirmModal
          projectName={deleteTarget.name}
          photoCount={deleteTarget.photoCount}
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDeleteProject()}
        />
      ) : null}

      {sharing ? (
        <V2ShareAlbumModal
          projectId={sharing.id}
          projectName={sharing.name}
          onClose={() => setSharing(null)}
          onCountChange={(count) => setProjectSharedCount(sharing.id, count)}
        />
      ) : null}

      {sendingToFamily ? (
        <V2SendToFamilyModal
          projectId={sendingToFamily.id}
          projectName={sendingToFamily.name}
          onClose={() => setSendingToFamily(null)}
        />
      ) : null}

      {leaveTarget ? (
        <V2Modal onClose={() => !busy && setLeaveTarget(null)} maxWidthClass="max-w-md" ariaLabel="Leave album">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-v2-ink">Leave “{leaveTarget.name}”?</h2>
            <p className="mt-2 text-sm leading-relaxed text-v2-muted">
              The album will disappear from your list. Photos you added stay in it for
              {leaveTarget.ownerName ? ` ${leaveTarget.ownerName}` : " its owner"}, who can invite you again
              later.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setLeaveTarget(null)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                Stay in album
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmLeaveAlbum()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Leave album
              </button>
            </div>
          </div>
        </V2Modal>
      ) : null}
    </div>
  );
}
