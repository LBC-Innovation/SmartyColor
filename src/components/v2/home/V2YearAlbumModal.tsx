"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ImageOff, Loader2, Sparkles } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useV2Toast } from "@/components/v2/V2Toast";
import { cn } from "@/lib/cn";
import * as library from "@/lib/library/client";
import type { LibraryProject, YearPhoto } from "@/lib/library/types";
import { STUDIO_PATH } from "@/lib/v2/guestSession";

/** Mirrors MAX_YEAR_ALBUM_PHOTOS on the server. */
const MAX_PHOTOS = 200;

type Props = {
  year: number;
  albumName: string;
  onClose: () => void;
  onCreated: (project: LibraryProject) => void;
};

/**
 * Start a "book of the year" album: every photo uploaded this calendar year, already picked,
 * so the customer only has to take out the ones they don't want.
 */
export function V2YearAlbumModal({ year, albumName, onClose, onCreated }: Props) {
  const toast = useV2Toast();
  const [photos, setPhotos] = useState<YearPhoto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void library.listYearPhotos(year).then((res) => {
      if (cancelled) return;
      if (res.error) setLoadError(res.error.message);
      else setPhotos(res.data!.slice(0, MAX_PHOTOS));
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const chosen = (photos ?? []).filter((p) => !excluded.has(p.id));

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    if (creating || chosen.length === 0) return;
    setCreating(true);
    const res = await library.createProjectFromPhotos(
      albumName,
      chosen.map((p) => p.id),
    );
    setCreating(false);
    if (res.error) {
      toast.error(res.error.message, "Couldn't create the album");
      return;
    }
    onCreated(res.data!);
  }

  return (
    <V2Modal
      onClose={() => !creating && onClose()}
      maxWidthClass="max-w-2xl"
      title={
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">New album</p>
          <h2 className="truncate text-lg font-semibold text-v2-ink">{albumName}</h2>
        </div>
      }
    >
      <div className="space-y-4 p-5 sm:p-6">
        {loadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : !photos ? (
          <p className="flex items-center gap-2 text-sm text-v2-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Finding your {year} photos…
          </p>
        ) : photos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center">
            <p className="text-sm text-v2-muted">You haven&apos;t added any photos in {year} yet.</p>
            <Link href={STUDIO_PATH} className="v2-btn-primary mt-4 inline-flex">
              Add photos
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-v2-muted">
              These are the photos you added in {year}. Tap any you&apos;d rather leave out. They&apos;re
              copied into the new album, coloring pages included, and stay in their albums too.
            </p>
            <ul className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-5">
              {photos.map((photo) => {
                const on = !excluded.has(photo.id);
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      onClick={() => toggle(photo.id)}
                      aria-pressed={on}
                      aria-label={`${on ? "Leave out" : "Include"} photo from ${photo.projectName || "an album"}`}
                      className={cn(
                        "relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-v2-bg-subtle transition",
                        on ? "border-v2-primary" : "border-transparent opacity-45",
                      )}
                    >
                      {photo.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff className="m-auto h-6 w-6 text-v2-muted" aria-hidden />
                      )}
                      {on ? (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-v2-primary text-white">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      ) : null}
                      {photo.hasSheet ? (
                        <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-1.5 text-[10px] font-semibold text-v2-ink">
                          Page ready
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-v2-muted">
                {chosen.length} of {photos.length} photos
              </p>
              <button
                type="button"
                onClick={() => void create()}
                disabled={creating || chosen.length === 0}
                className="v2-btn-primary"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                {creating ? "Creating album…" : "Create album"}
              </button>
            </div>
          </>
        )}
      </div>
    </V2Modal>
  );
}
