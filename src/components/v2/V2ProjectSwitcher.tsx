"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Users } from "lucide-react";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { AlbumSwitcherPanel, AlbumThumb } from "@/components/v2/albums/AlbumSwitcherPanel";
import { leaveAlbum } from "@/components/v2/studio/leaveAlbumGuard";
import { useAlbumRemoval } from "@/components/v2/albums/useAlbumRemoval";
import { ThemeModal } from "@/components/v2/book-packages/ThemeModal";
import { V2ShareAlbumModal } from "@/components/v2/V2ShareAlbumModal";
import { V2SendToFamilyModal } from "@/components/v2/share/V2SendToFamilyModal";
import { useV2Toast } from "@/components/v2/V2Toast";
import * as library from "@/lib/library/client";
import { cn } from "@/lib/cn";
import { BOOK_PACKAGES_ENABLED } from "@/lib/auth/features";
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
    setProjectSharedCount,
    setProjectDesignTheme,
  } = useV2Studio();
  const toast = useV2Toast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const removal = useAlbumRemoval();
  const [sharing, setSharing] = useState<V2ProjectMeta | null>(null);
  const [sendingToFamily, setSendingToFamily] = useState<V2ProjectMeta | null>(null);
  const [themeTarget, setThemeTarget] = useState<V2ProjectMeta | null>(null);
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
        <AlbumThumb name={activeProject?.name ?? ""} url={activeProject ? coverFor(activeProject) : null} size="sm" circle />
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
            leaveAlbum(() => {
              if (BOOK_PACKAGES_ENABLED) router.push("/studio/new");
              else createProject();
            });
          }}
          onSwitch={(id) => {
            setOpen(false);
            if (id !== activeProjectId) leaveAlbum(() => switchProject(id));
          }}
          onRename={(id, name) => {
            renameProject(id, name);
            toast.success({ title: "Album renamed", message: `Now called “${name.trim()}”.` });
          }}
          onShare={(p) => {
            setOpen(false);
            setSharing(p);
          }}
          onTheme={(p) => {
            setOpen(false);
            setThemeTarget(p);
          }}
          onSendToFamily={(p) => {
            setOpen(false);
            setSendingToFamily(p);
          }}
          onDelete={(p) => {
            setOpen(false);
            void removal.requestDelete(p);
          }}
          onLeave={(p) => {
            setOpen(false);
            removal.requestLeave(p);
          }}
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

      {themeTarget ? (
        <ThemeModal
          albumId={themeTarget.id}
          albumName={themeTarget.name}
          theme={projects.find((p) => p.id === themeTarget.id)?.designTheme ?? null}
          onSaved={(theme) => setProjectDesignTheme(themeTarget.id, theme)}
          onClose={() => setThemeTarget(null)}
        />
      ) : null}

      {removal.modals}
    </div>
  );
}
