"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, FolderInput, Loader2, Plus } from "lucide-react";
import { AlbumThumb } from "@/components/v2/albums/AlbumSwitcherPanel";
import { runPool } from "@/components/v2/studio/bulkDownload";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import { cn } from "@/lib/cn";
import { withNextParam } from "@/lib/auth/nextPath";
import { copyPhotoToAlbum } from "@/lib/library/client";
import { requestMigrationAfterSignup } from "@/lib/marketing/savePrompt";
import { projectMetaFromLibrary } from "@/lib/v2/cloudLibrary";
import { STUDIO_PATH } from "@/lib/v2/guestSession";
import type { V2PhotoEntry, V2ProjectMeta } from "@/lib/v2/studioTypes";

type Props = {
  /** The selected photos, in gallery order. */
  photos: V2PhotoEntry[];
  onClose: () => void;
  /** All finished (even partly): leave select mode. */
  onDone: () => void;
};

type Dest = { kind: "album"; project: V2ProjectMeta } | { kind: "new" };

const plural = (n: number) => (n === 1 ? "1 photo" : `${n} photos`);

/** Bulk "Move to album": copies each selected photo (with its pages) and, unless kept, removes the originals. */
export function MoveSelectedDialog(props: Props) {
  const { cloud } = useV2Studio();
  return cloud ? <MoveDialog {...props} /> : <GuestMoveDialog onClose={props.onClose} />;
}

function GuestMoveDialog({ onClose }: { onClose: () => void }) {
  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-md"
      icon={<FolderInput />} title="Move to album"
    >
      <div className="space-y-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1 sm:px-7">
        <p className="text-sm leading-relaxed text-v2-muted">
          Moving photos between albums needs a free account. Your pages come with you.
        </p>
        <Link
          href={withNextParam("/sign-up", STUDIO_PATH)}
          onClick={requestMigrationAfterSignup}
          className="v2-btn-primary min-h-11 w-full text-base"
        >
          Create a free account
        </Link>
        <button type="button" onClick={onClose} className="v2-btn-outline min-h-11 w-full">
          Not now
        </button>
      </div>
    </V2Modal>
  );
}

function MoveDialog({ photos, onClose, onDone }: Props) {
  const { projects, activeProjectId, upsertProject, removePhotosByIds } = useV2Studio();
  const toast = useV2Toast();
  const [dest, setDest] = useState<Dest | null>(null);
  const [newName, setNewName] = useState("");
  const [keep, setKeep] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const uploaded = photos.filter((p) => p.remote);
  const notUploaded = photos.length - uploaded.length;
  const keptByRule = uploaded.filter((p) => p.canDelete === false).length;
  const others = projects.filter((p) => p.id !== activeProjectId);
  const busy = progress != null;
  const destName = dest?.kind === "new" ? newName.trim() : dest?.project.name;
  const ready = uploaded.length > 0 && dest != null && (dest.kind === "album" || newName.trim().length > 0);

  async function run() {
    if (!dest || !ready) return;
    setError(null);
    const total = uploaded.length;
    setProgress({ done: 0, total });
    let done = 0;
    let projectId = dest.kind === "album" ? dest.project.id : null;
    let latest: V2ProjectMeta | null = dest.kind === "album" ? dest.project : null;
    const copied: V2PhotoEntry[] = [];
    let failed = 0;
    let firstError: string | null = null;

    async function copyOne(photo: V2PhotoEntry, target: { projectId: string } | { newAlbumName: string }) {
      const res = await copyPhotoToAlbum(photo.remote!.photoId, target);
      done += 1;
      setProgress({ done, total });
      if (res.error) {
        failed += 1;
        firstError ??= res.error.message;
        return null;
      }
      copied.push(photo);
      latest = projectMetaFromLibrary(res.data!.project);
      return latest;
    }

    try {
      let rest = uploaded;
      if (!projectId) {
        // A new album is made by the first copy; the rest go into it by id.
        const first = await copyOne(uploaded[0], { newAlbumName: newName.trim() });
        if (!first) {
          setError(firstError ?? "Couldn't make the album. Try again.");
          setProgress(null);
          return;
        }
        projectId = first.id;
        rest = uploaded.slice(1);
      }
      const target = { projectId };
      await runPool(rest, 2, () => false, async (photo) => {
        await copyOne(photo, target);
      });
      if (latest) upsertProject(latest);

      let removed = 0;
      if (!keep && copied.length > 0) {
        const res = await removePhotosByIds(copied.map((p) => p.id));
        removed = res.deleted;
      }
      const name = destName || "your new album";
      const verb = keep ? "Copied" : "Moved";
      if (failed === 0) {
        toast.success({ message: `${verb} ${plural(copied.length)} to ${name}.` });
      } else {
        toast.error(`${verb} ${copied.length} of ${total}. ${failed} couldn't be ${keep ? "copied" : "moved"}.`);
      }
      if (!keep && removed < copied.length) {
        toast.info(
          `${plural(copied.length - removed)} stayed in this album because they were added by someone else or couldn't be removed.`,
        );
      }
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setProgress(null);
    }
  }

  return (
    <V2Modal
      onClose={() => !busy && onClose()}
      maxWidthClass="max-w-md"
      icon={<FolderInput />} title={`${keep ? "Copy" : "Move"} ${plural(photos.length)} to`}
    >
      <div className="px-3 pt-2 sm:px-4">
        {notUploaded > 0 ? (
          <p className="px-2 pb-2 text-sm text-amber-700">
            {plural(notUploaded)} still uploading and will be skipped.
          </p>
        ) : null}
        <div role="radiogroup" aria-label="Albums" className="max-h-[45dvh] overflow-y-auto overscroll-contain">
          {others.map((project) => {
            const picked = dest?.kind === "album" && dest.project.id === project.id;
            return (
              <button
                key={project.id}
                type="button"
                role="radio"
                aria-checked={picked}
                disabled={busy}
                onClick={() => setDest({ kind: "album", project })}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition disabled:opacity-50",
                  picked ? "bg-v2-primary-light" : "hover:bg-v2-bg-subtle",
                )}
              >
                <AlbumThumb name={project.name} url={project.coverUrl} shared={project.role === "contributor"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-v2-ink">{project.name || "Untitled album"}</span>
                  <span className="block truncate text-xs text-v2-muted">
                    {plural(project.photoCount)}
                    {project.role === "contributor" ? ` · Shared by ${project.ownerName?.trim() || "someone"}` : ""}
                  </span>
                </span>
                {picked ? <Check className="h-4 w-4 shrink-0 text-v2-link" aria-hidden /> : null}
              </button>
            );
          })}
          {dest?.kind === "new" ? (
            <div className="rounded-xl bg-v2-primary-light px-2 py-2">
              <label htmlFor="move-new-album" className="px-1 text-xs font-semibold text-v2-muted">
                New album name
              </label>
              <input
                ref={nameRef}
                id="move-new-album"
                autoFocus
                className="v2-input mt-1"
                placeholder="e.g. Summer at the lake"
                maxLength={120}
                value={newName}
                disabled={busy}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void run();
                  }
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              role="radio"
              aria-checked={false}
              disabled={busy}
              onClick={() => setDest({ kind: "new" })}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-semibold text-v2-link transition hover:bg-v2-primary-light/50 disabled:opacity-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-v2-primary text-white" aria-hidden>
                <Plus className="h-5 w-5" />
              </span>
              New album
            </button>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 space-y-3 border-t border-gray-200 bg-v2-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-v2-ink">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 accent-v2-primary"
            checked={keep}
            disabled={busy}
            onChange={(e) => setKeep(e.target.checked)}
          />
          Keep them in this album too
        </label>
        {!keep && keptByRule > 0 ? (
          <p className="text-xs text-v2-muted">
            {plural(keptByRule)} {keptByRule === 1 ? "was" : "were"} added by someone else, so a copy goes over and the original stays.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="v2-btn-outline min-h-11">
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => void run()}
            className="v2-btn-primary min-h-11 w-full sm:w-auto"
            aria-live="polite"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {busy
              ? `${keep ? "Copying" : "Moving"} ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
              : ready
                ? `${keep ? "Copy" : "Move"} to ${destName}`
                : "Pick an album"}
          </button>
        </div>
      </div>
    </V2Modal>
  );
}
