"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, CalendarHeart, ImagePlus, Loader2, LogOut, Package, Plus, Trash2, Users } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2OrderTrackCard } from "@/components/v2/orders/V2OrderTrackCard";
import { isUnpaid } from "@/components/v2/orders/V2MyOrdersStudio";
import { V2YearAlbumModal } from "@/components/v2/home/V2YearAlbumModal";
import { V2HeardFromCard } from "@/components/v2/home/V2HeardFromCard";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useAlbumRemoval } from "@/components/v2/albums/useAlbumRemoval";
import { projectMetaFromLibrary } from "@/lib/v2/cloudLibrary";
import { YEAR_ALBUM_PARAM, YEAR_ALBUM_PARAM_VALUE, writeYearAlbumIntent } from "@/lib/v2/yearAlbumIntent";
import { activeSeasonalPrompt } from "@/content/seasonalPrompt";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import * as library from "@/lib/library/client";
import type { LibraryProject } from "@/lib/library/types";
import type { BookCartSummary } from "@/lib/orders/cartTypes";
import type { BookOrderStatus, BookOrderSummary } from "@/lib/orders/types";
import { getBookFormat, isPrintBindingId } from "@/lib/print/bookBindings";
import { STUDIO_PATH } from "@/lib/v2/guestSession";
import { BOOK_PACKAGES_ENABLED } from "@/lib/auth/features";

const CONTENT = "mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8";

function albumHref(projectId: string): string {
  return `${STUDIO_PATH}?album=${encodeURIComponent(projectId)}`;
}

const IN_PROGRESS_ORDER: BookOrderStatus[] = ["paid", "submitting_to_lulu", "submitted_to_lulu", "in_production", "shipped"];

/** Orders still worth following: unpaid ones first (they need the customer), then those on their way, newest first. */
function ordersToTrack(orders: BookOrderSummary[]): BookOrderSummary[] {
  const newestFirst = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  // A paid print-at-home PDF is finished: nothing ships.
  const onTheWay = newestFirst.filter(
    (o) => IN_PROGRESS_ORDER.includes(o.status) && !(o.fulfillment === "digital" && o.status === "paid"),
  );
  return [...newestFirst.filter((o) => isUnpaid(o)), ...onTheWay];
}

/** Orders shown in the column before "See all orders". */
const TRACK_LIMIT = 4;

function cartFormatName(bindingId: string | null): string | null {
  if (bindingId === "digital" || isPrintBindingId(bindingId)) return getBookFormat(bindingId).shortLabel;
  return null;
}

function photoCountLabel(count: number): string {
  return count === 1 ? "1 photo" : `${count} photos`;
}

/** Tile spans for 1–4 pictures: one fills, two split, three is one tall and two stacked, four is a 2×2. */
const COLLAGE_TILES: Record<number, string[]> = {
  1: ["col-span-2 row-span-2"],
  2: ["row-span-2", "row-span-2"],
  3: ["row-span-2", "", ""],
  4: ["", "", "", ""],
};

/** A small collage of the album's photos, or a soft placeholder for an empty album. */
function AlbumCollage({ urls, shared }: { urls: string[]; shared: boolean }) {
  const shown = urls.slice(0, 4);
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-v2-primary-light">
      {shown.length > 0 ? (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
          {shown.map((url, i) => (
            <span key={url} className={`relative overflow-hidden bg-white ${COLLAGE_TILES[shown.length][i]}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </span>
          ))}
        </div>
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-v2-primary-light to-white">
          <ImagePlus className="h-7 w-7 text-v2-primary/60" aria-hidden />
        </span>
      )}
      {shared ? (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-v2-navy shadow-sm">
          <Users className="h-3 w-3" aria-hidden />
          Shared
        </span>
      ) : null}
    </div>
  );
}

/**
 * Delete (or leave, for an album shared with you) on an album card. Always shown on touch screens;
 * with a mouse it appears when the card is hovered or the button has keyboard focus.
 */
function RemoveAlbumButton({ name, shared, onClick }: { name: string; shared: boolean; onClick: () => void }) {
  const Icon = shared ? LogOut : Trash2;
  const label = shared ? `Leave “${name}”` : `Delete “${name}”`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={shared ? "Leave album" : "Delete album"}
      className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-v2-muted shadow-sm ring-1 ring-black/5 transition hover:bg-white hover:text-red-600 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/album:opacity-100 pointer-fine:group-focus-within/album:opacity-100"
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

/**
 * The seasonal "book of the year" album, as a card the same size as the albums beside it, as if
 * it had always been there waiting. Opens the year-album picker.
 */
function YearAlbumTile({ year, albumName, onStart }: { year: number; albumName: string; onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="v2-panel group flex h-full w-full flex-col overflow-hidden text-left transition hover:border-v2-primary/40 hover:shadow-md"
    >
      <span className="relative flex aspect-[4/3] w-full flex-col items-center justify-center bg-gradient-to-br from-v2-primary via-v2-primary to-v2-plum text-white">
        <CalendarHeart className="h-5 w-5 text-brand-amber" aria-hidden />
        <span className="v2-brand-title mt-1 text-3xl leading-none tracking-tight sm:text-4xl">{year}</span>
        <span className="absolute left-2 top-2 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm">
          New
        </span>
      </span>
      <span className="min-w-0 px-3 py-2.5">
        <span className="block truncate font-semibold text-v2-ink">{albumName}</span>
        <span className="flex items-center gap-1 truncate text-xs font-semibold text-v2-link">
          Start this album
          <ArrowRight className="h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </span>
    </button>
  );
}

/**
 * Where signed-in people land: the book they were making (if any) and their albums, with the
 * seasonal album as the first card when one is running. Each album card can be deleted from here. Guests have no albums on the server, so they go to the studio.
 */
export function V2HomeStudio() {
  const router = useRouter();
  const toast = useV2Toast();
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<LibraryProject[] | null>(null);
  const [cart, setCart] = useState<BookCartSummary | null>(null);
  const [orders, setOrders] = useState<BookOrderSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [yearAlbumOpen, setYearAlbumOpen] = useState(false);
  // Decided once on the client: the prompt depends on today's local date.
  const [seasonal] = useState(() => activeSeasonalPrompt());

  useEffect(() => {
    if (!authLoading && !user) router.replace(STUDIO_PATH);
  }, [authLoading, user, router]);

  const studio = useV2Studio();
  // After a delete: fetch the list again (deleting the last album makes a fresh one).
  const reloadAlbums = useCallback(async () => {
    const res = await library.listProjects({ previews: true });
    if (!res.error) setProjects(res.data!);
  }, []);
  const removal = useAlbumRemoval({
    onRemoved: (removed) => {
      setProjects((prev) => prev?.filter((p) => p.id !== removed.id) ?? prev);
      void reloadAlbums();
    },
  });
  // The studio keeps the album list too; deleting before it has loaded would leave it out of step.
  const canRemove = studio.hydrated && studio.cloud;

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void Promise.all([library.listProjects({ previews: true }), api.listBookCarts(), api.listOrders()]).then(
      ([projectsRes, cartsRes, ordersRes]) => {
      if (cancelled) return;
      if (projectsRes.error) setLoadError(projectsRes.error.message);
      else setProjects(projectsRes.data!);
      // A missing cart list only hides the card.
      if (!cartsRes.error) setCart(cartsRes.data?.[0] ?? null);
      // Same for orders.
      if (!api.isError(ordersRes)) setOrders(ordersToTrack(ordersRes.data));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function createAlbum() {
    if (creating) return;
    // New albums start at "Start with the book"; with nothing to sell there it makes the album as before.
    if (BOOK_PACKAGES_ENABLED) {
      router.push("/studio/new");
      return;
    }
    setCreating(true);
    const res = await library.createProject(`Album ${(projects?.length ?? 0) + 1}`);
    setCreating(false);
    if (res.error) {
      toast.error(res.error.message, "Couldn't create the album");
      return;
    }
    router.push(albumHref(res.data!.id));
  }

  /** The year album starts like every new album, at "Start with the book"; its photos come after. */
  function startYearAlbum() {
    if (!seasonal) return;
    if (!BOOK_PACKAGES_ENABLED) {
      setYearAlbumOpen(true);
      return;
    }
    writeYearAlbumIntent({ year: seasonal.year, albumName: seasonal.albumName });
    router.push(`/studio/new?${YEAR_ALBUM_PARAM}=${YEAR_ALBUM_PARAM_VALUE}`);
  }

  const firstName = user?.displayName?.trim().split(/\s+/)[0];

  return (
    <V2StudioFrame>
      <main className="flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-8">
        <div className={CONTENT}>
          <header className="mb-6">
            <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">
              {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
            </h1>
          </header>

          {loadError ? (
            <p className="v2-panel p-4 text-sm text-red-700" role="alert">
              {loadError}
            </p>
          ) : !projects ? (
            <div className="flex min-h-[30vh] items-center justify-center text-v2-muted">
              <Loader2 className="h-8 w-8 animate-spin text-v2-primary" aria-label="Loading" />
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_23rem]">
              {/* Orders to track: first on phones (time-sensitive), a column of its own on desktop. */}
              {orders ? (
                <aside
                  aria-labelledby="home-orders"
                  className={`min-w-0 lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1 ${orders.length === 0 ? "hidden lg:block" : ""}`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 id="home-orders" className="v2-section-title">
                      Orders to track
                    </h2>
                    <Link href="/orders" className="-my-3 inline-flex min-h-11 items-center text-sm font-semibold text-v2-link hover:underline">
                      All orders
                    </Link>
                  </div>
                  {orders.length > 0 ? (
                    <ul className="space-y-3">
                      {orders.slice(0, TRACK_LIMIT).map((o) => (
                        <li key={o.id}>
                          <V2OrderTrackCard order={o} />
                        </li>
                      ))}
                      {orders.length > TRACK_LIMIT ? (
                        <li>
                          <Link href="/orders" className="inline-flex min-h-11 items-center text-sm font-semibold text-v2-link hover:underline">
                            {orders.length - TRACK_LIMIT} more on the way
                          </Link>
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 p-5 text-center">
                      <Package className="mx-auto h-8 w-8 text-v2-muted" aria-hidden />
                      <p className="mt-2 text-sm font-semibold text-v2-ink">Nothing on its way yet</p>
                      <p className="mt-1 text-sm text-v2-muted">
                        Books you order show up here, with delivery dates and tracking.
                      </p>
                      <Link href={STUDIO_PATH} className="v2-btn-outline mt-3 min-h-11 text-sm">
                        <BookOpen className="h-4 w-4" aria-hidden />
                        Make a book
                      </Link>
                    </div>
                  )}
                </aside>
              ) : null}

              <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">
              <V2HeardFromCard />
              {cart ? (
                <section aria-label="Continue your book">
                  <Link
                    href={`${STUDIO_PATH}?cart=${encodeURIComponent(cart.id)}&book=open`}
                    className="v2-panel group flex items-center gap-4 p-4 transition hover:border-v2-primary/40 sm:p-5"
                  >
                    {cart.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cart.thumbUrl}
                        alt=""
                        className="h-20 w-16 shrink-0 rounded-md border border-gray-200 bg-white object-cover"
                      />
                    ) : (
                      <span className="flex h-20 w-16 shrink-0 items-center justify-center rounded-md bg-v2-primary-light text-v2-primary">
                        <BookOpen className="h-7 w-7" aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-v2-muted">
                        Continue your book
                      </span>
                      <span className="mt-0.5 block truncate text-lg font-semibold text-v2-ink">{cart.title}</span>
                      <span className="block truncate text-sm text-v2-muted">
                        {[
                          cart.pageCount > 0 ? `${cart.pageCount} pages` : null,
                          cartFormatName(cart.bindingId),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="v2-btn-primary hidden shrink-0 sm:inline-flex">
                      Continue
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-v2-primary sm:hidden" aria-hidden />
                  </Link>
                </section>
              ) : null}

              <section aria-labelledby="home-albums">
                <h2 id="home-albums" className="v2-section-title mb-3">
                  Your albums
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {seasonal && !projects.some((p) => p.name.trim() === seasonal.albumName) ? (
                    <li>
                      <YearAlbumTile
                        year={seasonal.year}
                        albumName={seasonal.albumName}
                        onStart={startYearAlbum}
                      />
                    </li>
                  ) : null}
                  {projects.map((project) => (
                    <li key={project.id} className="group/album relative">
                      <Link
                        href={albumHref(project.id)}
                        className="v2-panel group flex h-full flex-col overflow-hidden transition hover:border-v2-primary/40 hover:shadow-md"
                      >
                        <AlbumCollage urls={project.previewUrls ?? []} shared={project.role === "contributor"} />
                        <span className="min-w-0 px-3 py-2.5">
                          <span className="block truncate font-semibold text-v2-ink" title={project.name}>
                            {project.name}
                          </span>
                          <span className="block truncate text-xs text-v2-muted">
                            {project.role === "contributor"
                              ? `Shared by ${project.ownerName?.trim() || "someone"}`
                              : photoCountLabel(project.photoCount)}
                          </span>
                        </span>
                      </Link>
                      {canRemove ? (
                        <RemoveAlbumButton
                          name={project.name}
                          shared={project.role === "contributor"}
                          onClick={() => {
                            const meta = studio.projects.find((p) => p.id === project.id) ?? projectMetaFromLibrary(project);
                            if (project.role === "contributor") removal.requestLeave(meta);
                            else void removal.requestDelete(meta);
                          }}
                        />
                      ) : null}
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => void createAlbum()}
                      disabled={creating}
                      className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 p-4 text-sm font-semibold text-v2-link transition hover:border-v2-primary/40 hover:bg-v2-primary-light disabled:opacity-60"
                    >
                      {creating ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />}
                      New album
                    </button>
                  </li>
                </ul>
              </section>

              </div>
            </div>
          )}
        </div>
      </main>

      {removal.modals}
      {yearAlbumOpen && seasonal ? (
        <V2YearAlbumModal
          year={seasonal.year}
          albumName={seasonal.albumName}
          onClose={() => setYearAlbumOpen(false)}
          onCreated={(project) => router.push(albumHref(project.id))}
        />
      ) : null}
    </V2StudioFrame>
  );
}
