"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Images,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { AdminUser } from "@/lib/api/types";
import type {
  AdminAlbum,
  AdminAlbumPhoto,
  AdminAlbumPrepaid,
  AdminBookPageStatus,
  AdminUserAlbums,
} from "@/lib/admin/userAlbums";
import { PURCHASE_CODES_PERMISSION } from "@/lib/purchaseCodes/permissions";
import * as api from "@/lib/api/client";
import { EmptyState, StatusPill } from "@/components/v2/admin/ui";
import {
  count,
  fullDateTime,
  money,
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

const BOOK_PAGE: Record<
  AdminBookPageStatus,
  {
    label: string;
    tone: "good" | "neutral" | "warn" | "info" | "progress";
    title: string;
    included: boolean;
  }
> = {
  included: {
    label: "Included",
    tone: "good",
    included: true,
    title: "The package paid for this page.",
  },
  brought_in: {
    label: "Included",
    tone: "good",
    included: true,
    title: "Included. The page came into the album already made.",
  },
  granted: {
    label: "Granted",
    tone: "progress",
    included: true,
    title: "Included because an admin chose it.",
  },
  extra_paid: {
    label: "Extra · paid",
    tone: "info",
    included: false,
    title: "Outside the package, paid from the wallet.",
  },
  extra: {
    label: "Extra",
    tone: "warn",
    included: false,
    title:
      "Outside the package and not paid for; the book order charges for it.",
  },
  no_page: {
    label: "No page",
    tone: "neutral",
    included: false,
    title: "No coloring page yet.",
  },
};

/** Whether an admin can still change which pages this book includes. */
function editable(prepaid: AdminAlbumPrepaid | null): boolean {
  return !!prepaid && prepaid.status === "active" && !prepaid.bookOrderId;
}

function prepaidName(prepaid: AdminAlbumPrepaid): string {
  return prepaid.source === "package" ? "Pre-paid book" : "Gift book code";
}

function prepaidState(prepaid: AdminAlbumPrepaid): {
  label: string;
  tone: "good" | "info" | "neutral" | "bad";
} {
  if (prepaid.refundedAt)
    return { label: "Canceled, refunded", tone: "neutral" };
  if (prepaid.status === "void") return { label: "Void", tone: "neutral" };
  if (prepaid.bookOrderId) return { label: "Book ordered", tone: "info" };
  return { label: "Not ordered yet", tone: "good" };
}

/** Every album the customer owns or was invited to, with photo and page counts and each photo's details. */
export function CustomerAlbumsTab({ user }: { user: AdminUser }) {
  const [data, setData] = useState<AdminUserAlbums | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user: me } = useAuth();
  const canEditBook =
    me?.permissions.includes(PURCHASE_CODES_PERMISSION) ?? false;

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

  const reload = useCallback(async () => {
    const r = await api.adminUserAlbums(user.id);
    if (!api.isError(r)) setData(r.data);
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
          <AlbumCard
            key={album.id}
            album={album}
            canEditBook={canEditBook}
            onChanged={reload}
          />
        ))}
      </ul>
      <p className="text-xs text-v2-muted">
        Deleted albums and photos aren&apos;t kept; the History tab shows when
        they were deleted.
      </p>
    </div>
  );
}

function AlbumCard({
  album,
  canEditBook,
  onChanged,
}: {
  album: AdminAlbum;
  canEditBook: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const prepaid = album.prepaid;
  const canToggle = canEditBook && editable(prepaid);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function toggle(photo: AdminAlbumPhoto, include: boolean) {
    setBusyId(photo.id);
    setToggleError(null);
    const r = await api.adminSetPackagePage(photo.id, include);
    if (api.isError(r)) setToggleError(r.error.message);
    else await onChanged();
    setBusyId(null);
  }

  const extras = album.photos.filter((p) => p.bookPage === "extra").length;
  const paidExtras = album.photos.filter(
    (p) => p.bookPage === "extra_paid",
  ).length;
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
              {prepaid ? (
                <StatusPill
                  tone={prepaid.status === "active" ? "progress" : "neutral"}
                  icon={BookOpen}
                >
                  {prepaidName(prepaid)}
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
            {prepaid ? (
              <span className="mt-0.5 block text-sm text-v2-ink">
                Book includes {count(prepaid.includedNow)} of{" "}
                {plural(prepaid.includedPages, "page")}
                {extras + paidExtras > 0
                  ? ` · ${count(extras + paidExtras)} extra`
                  : ""}
              </span>
            ) : null}
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
          {prepaid ? (
            <PrepaidSummary
              prepaid={prepaid}
              extras={extras}
              paidExtras={paidExtras}
              canEdit={canEditBook}
            />
          ) : null}
          {toggleError ? (
            <p className="mb-2 text-sm text-red-700" role="alert">
              {toggleError}
            </p>
          ) : null}
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
                    {prepaid ? (
                      <th
                        scope="col"
                        className="px-2 text-left font-semibold"
                        title="Whether the pre-paid book pays for this page"
                      >
                        In book
                      </th>
                    ) : null}
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
                        {prepaid ? (
                          <td className="whitespace-nowrap px-2 py-1.5">
                            <BookPageCell
                              photo={photo}
                              canToggle={canToggle}
                              busy={busyId === photo.id}
                              disabled={busyId !== null}
                              onToggle={(include) =>
                                void toggle(photo, include)
                              }
                            />
                          </td>
                        ) : null}
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

function PrepaidSummary({
  prepaid,
  extras,
  paidExtras,
  canEdit,
}: {
  prepaid: AdminAlbumPrepaid;
  extras: number;
  paidExtras: number;
  canEdit: boolean;
}) {
  const state = prepaidState(prepaid);
  const orphaned = Math.max(prepaid.pagesUsed - prepaid.includedNow, 0);
  const open = Math.max(prepaid.includedPages - prepaid.includedNow, 0);
  return (
    <div className="mb-3 rounded-lg border border-v2-primary-light bg-v2-bg-subtle px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-v2-ink">
          {prepaidName(prepaid)}
        </span>
        <StatusPill tone={state.tone}>{state.label}</StatusPill>
        <CopyId id={prepaid.codeId} />
        <span className="font-mono text-v2-muted">{prepaid.code}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          <dt className="text-v2-muted">Book</dt>
          <dd className="text-v2-ink">
            {prepaid.bindingLabel}, {plural(prepaid.includedPages, "page")}
            {prepaid.grantedExtra > 0
              ? ` (${count(prepaid.grantedExtra)} granted)`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-v2-muted">Paid</dt>
          <dd className="text-v2-ink">
            {prepaid.priceCents != null
              ? `${money(prepaid.priceCents)}${prepaid.paidWith === "card" ? " by card" : prepaid.paidWith === "credit" ? " from wallet" : ""}`
              : "Gift"}
          </dd>
        </div>
        <div>
          <dt className="text-v2-muted">Included now</dt>
          <dd className="text-v2-ink">
            {count(prepaid.includedNow)} of {count(prepaid.includedPages)}
            {open > 0 ? ` · ${count(open)} open` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-v2-muted">Extra pages</dt>
          <dd className="text-v2-ink">
            {count(extras)} not paid
            {paidExtras > 0 ? ` · ${count(paidExtras)} paid` : ""}
          </dd>
        </div>
      </dl>
      {orphaned > 0 && prepaid.pagesUsed >= prepaid.includedPages ? (
        <p className="mt-2 text-amber-800">
          {count(orphaned)} {orphaned === 1 ? "page" : "pages"} the package made{" "}
          {orphaned === 1 ? "was" : "were"} deleted and still{" "}
          {orphaned === 1 ? "counts" : "count"}, so the customer can&apos;t make
          new pages with it. Pages already made still fill open slots, and you
          can include pages here.
        </p>
      ) : null}
      {canEdit && editable(prepaid) ? (
        <p className="mt-2 text-v2-muted">
          Tick a page to include it. It fills an open slot, or adds a page to
          the book when all {count(prepaid.includedPages)} are taken. Nothing is
          charged, and refunds don&apos;t count it.
        </p>
      ) : null}
    </div>
  );
}

function BookPageCell({
  photo,
  canToggle,
  busy,
  disabled,
  onToggle,
}: {
  photo: AdminAlbumPhoto;
  canToggle: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: (include: boolean) => void;
}) {
  const status = photo.bookPage ?? "no_page";
  const meta = BOOK_PAGE[status];
  return (
    <span className="flex items-center gap-2">
      {canToggle ? (
        busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-v2-muted" aria-hidden />
        ) : (
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-v2-primary disabled:cursor-not-allowed"
            checked={meta.included}
            disabled={disabled}
            aria-label={`Include ${photo.fileName ?? "this page"} in the pre-paid book`}
            title={
              meta.included
                ? "Take this page out of the pre-paid book"
                : "Include this page in the pre-paid book"
            }
            onChange={(e) => onToggle(e.target.checked)}
          />
        )
      ) : null}
      <span title={meta.title}>
        <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
      </span>
    </span>
  );
}
