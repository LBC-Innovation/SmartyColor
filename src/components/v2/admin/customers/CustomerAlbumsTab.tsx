"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Copy, Images, Loader2 } from "lucide-react";
import type { AdminUser } from "@/lib/api/types";
import type {
  AdminAlbum,
  AdminAlbumPhoto,
  AdminUserAlbums,
} from "@/lib/admin/userAlbums";
import * as api from "@/lib/api/client";
import { EmptyState, StatusPill } from "@/components/v2/admin/ui";
import {
  count,
  fullDateTime,
  relativeTime,
  shortDate,
} from "@/components/v2/admin/format";
import { cn } from "@/lib/cn";

function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-mono text-xs text-v2-muted hover:text-v2-ink"
      title="Copy the full id"
      onClick={() => {
        void navigator.clipboard.writeText(id).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {id.slice(0, 8)}
      {copied ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : (
        <Copy className="h-3 w-3" aria-hidden />
      )}
      <span className="sr-only">{copied ? "Copied" : "Copy id"}</span>
    </button>
  );
}

/** What the album shows for this photo right now. */
function showing(photo: AdminAlbumPhoto): {
  label: string;
  tone: "good" | "neutral" | "bad";
} {
  if (photo.activeVersionKind === "missing")
    return { label: "Missing version", tone: "bad" };
  if (photo.activeVersionKind === "sheet")
    return { label: "Coloring page", tone: "good" };
  if (photo.activeVersionKind)
    return { label: "Portrait version", tone: "neutral" };
  return { label: "Original photo", tone: "neutral" };
}

/** Every album the customer owns or was invited to, with photo and page counts and each photo's details. */
export function CustomerAlbumsTab({ user }: { user: AdminUser }) {
  const [data, setData] = useState<AdminUserAlbums | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api.adminUserAlbums(user.id).then((r) => {
      if (!alive) return;
      if (api.isError(r)) setError(r.error.message);
      else setData(r.data);
    });
    return () => {
      alive = false;
    };
  }, [user.id]);

  if (error) {
    return (
      <p className="text-sm text-red-700" role="alert">
        Couldn&apos;t load albums: {error}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-v2-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading albums…
      </p>
    );
  }
  if (data.albums.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200">
        <EmptyState icon={Images} title="No albums.">
          Deleted albums aren&apos;t kept; the History tab shows when they were
          deleted.
        </EmptyState>
      </div>
    );
  }

  const photos = data.albums.flatMap((a) => a.photos);
  const withPage = photos.filter((p) => p.sheetCount > 0).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-v2-muted">
        {plural(data.albums.length, "album")} · {plural(photos.length, "photo")}{" "}
        · {count(withPage)} with a coloring page
      </p>
      <ul className="space-y-2">
        {data.albums.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </ul>
      <p className="text-xs text-v2-muted">
        Deleted albums and photos aren&apos;t kept; the History tab shows when
        they were deleted.
      </p>
    </div>
  );
}

function AlbumCard({ album }: { album: AdminAlbum }) {
  const [open, setOpen] = useState(false);
  const withPage = album.photos.filter((p) => p.sheetCount > 0).length;
  const missing = album.photos.filter(
    (p) => p.activeVersionKind === "missing",
  ).length;

  return (
    <li className="rounded-xl border border-gray-200">
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-v2-bg-subtle">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-v2-muted transition-transform",
              open && "rotate-90",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-v2-ink">{album.name}</span>
              {album.role === "member" ? (
                <StatusPill
                  tone={album.shareStatus === "accepted" ? "info" : "warn"}
                >
                  {album.shareStatus === "accepted"
                    ? "Shared with them"
                    : `Invited (${album.shareStatus ?? "unknown"})`}
                </StatusPill>
              ) : null}
              {missing > 0 ? (
                <StatusPill tone="bad">
                  {plural(missing, "broken photo")}
                </StatusPill>
              ) : null}
            </span>
            <span className="mt-0.5 block text-sm text-v2-ink">
              {plural(album.photos.length, "photo")} · {count(withPage)} with a
              page
              {album.photos.length - withPage > 0
                ? ` · ${count(album.photos.length - withPage)} without`
                : ""}
            </span>
            <span className="mt-0.5 block text-xs text-v2-muted">
              Created{" "}
              <time title={fullDateTime(album.createdAt)}>
                {shortDate(album.createdAt)}
              </time>{" "}
              · updated{" "}
              <time title={fullDateTime(album.updatedAt)}>
                {relativeTime(album.updatedAt)}
              </time>
              {album.bookOrderCount
                ? ` · ${plural(album.bookOrderCount, "book order")}`
                : ""}
              {album.shareCount
                ? ` · ${plural(album.shareCount, "person", "people")} invited`
                : ""}
            </span>
          </span>
        </button>
        <CopyId id={album.id} />
      </div>

      {open ? (
        <div className="border-t border-gray-100 px-4 py-3">
          <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-v2-muted">Design</dt>
              <dd className="text-v2-ink">{album.designTheme ?? "Default"}</dd>
            </div>
            <div>
              <dt className="text-v2-muted">Story step</dt>
              <dd className="text-v2-ink">{album.storyPhase ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-v2-muted">Story written</dt>
              <dd className="text-v2-ink">{album.hasStory ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-v2-muted">Their role</dt>
              <dd className="text-v2-ink">
                {album.role === "owner" ? "Owner" : "Invited"}
              </dd>
            </div>
          </dl>
          {album.photos.length === 0 ? (
            <p className="text-sm text-v2-muted">No photos in this album.</p>
          ) : (
            <div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <caption className="sr-only">Photos in {album.name}</caption>
                <thead className="sticky top-0 bg-v2-bg-subtle text-v2-muted">
                  <tr>
                    <th
                      scope="col"
                      className="h-8 px-2 text-right font-semibold"
                    >
                      #
                    </th>
                    <th scope="col" className="px-2 text-left font-semibold">
                      Photo
                    </th>
                    <th scope="col" className="px-2 text-left font-semibold">
                      Showing
                    </th>
                    <th
                      scope="col"
                      className="px-2 text-right font-semibold"
                      title="Coloring page versions"
                    >
                      Pages
                    </th>
                    <th scope="col" className="px-2 text-right font-semibold">
                      Edits
                    </th>
                    <th scope="col" className="px-2 text-left font-semibold">
                      Added
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {album.photos.map((photo, i) => {
                    const s = showing(photo);
                    return (
                      <tr
                        key={photo.id}
                        className="border-t border-gray-100 align-top"
                      >
                        <td className="px-2 py-1.5 text-right tabular-nums text-v2-muted">
                          {i + 1}
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className="block max-w-[14rem] truncate text-v2-ink"
                            title={photo.fileName ?? undefined}
                          >
                            {photo.fileName ?? "No file name"}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 text-v2-muted">
                            <CopyId id={photo.id} />
                            {photo.width && photo.height
                              ? `${photo.width}×${photo.height}`
                              : null}
                            {photo.orientation ? ` ${photo.orientation}` : null}
                            {photo.uploadedByOther
                              ? " · added by someone else"
                              : null}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <StatusPill tone={s.tone}>{s.label}</StatusPill>
                          {photo.otherVersionCount ? (
                            <span className="mt-0.5 block text-v2-muted">
                              +{plural(photo.otherVersionCount, "portrait")}
                            </span>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right tabular-nums",
                            photo.sheetCount === 0 && "text-v2-muted",
                          )}
                        >
                          {count(photo.sheetCount)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {count(photo.editCount)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <time title={fullDateTime(photo.createdAt)}>
                            {shortDate(photo.createdAt)}
                          </time>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}
