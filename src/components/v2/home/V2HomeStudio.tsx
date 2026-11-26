"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CalendarHeart,
  ImagePlus,
  Loader2,
  LogOut,
  Package,
  Plus,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
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
import { bookCartHref, type BookCartSummary } from "@/lib/orders/cartTypes";
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

/** One line on where the orders stand: payment owed comes first, then shipped, else on the way. */
function ordersSummary(orders: BookOrderSummary[]): string {
  const unpaid = orders.filter((o) => isUnpaid(o)).length;
  if (unpaid > 0) return unpaid === 1 ? "1 order needs payment" : `${unpaid} orders need payment`;
  const shipped = orders.filter((o) => o.status === "shipped").length;
  if (shipped === orders.length) return orders.length === 1 ? "1 order shipped" : `${orders.length} orders shipped`;
  return orders.length === 1 ? "1 order on its way" : `${orders.length} orders on their way`;
}

const QUICK_ACTION_ROW =
  "v2-panel group flex min-h-16 items-center gap-3 p-3 transition hover:border-v2-primary/40 active:scale-[0.99] motion-reduce:active:scale-100 sm:p-4";

/** The leading picture of a quick action: the same 48px tile whatever it holds. */
function QuickActionTile({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "warning" }) {
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl ${tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-v2-primary-light text-v2-primary"}`}
    >
      {children}
    </span>
  );
}

function QuickActionText({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-semibold text-v2-ink">{title}</span>
      {detail ? <span className="block truncate text-sm text-v2-muted">{detail}</span> : null}
    </span>
  );
}

function QuickActionArrow() {
  return (
    <ArrowRight
      className="h-5 w-5 shrink-0 text-v2-primary transition-transform group-hover:translate-x-0.5"
      aria-hidden
    />
  );
}

/** Picks up the book in the cart where it was left. */
function ContinueBookAction({ cart }: { cart: BookCartSummary }) {
  const detail = [cart.title, cart.pageCount > 0 ? `${cart.pageCount} pages` : null, cartFormatName(cart.bindingId)]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={bookCartHref(cart)} className={QUICK_ACTION_ROW}>
      <QuickActionTile>
        {cart.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cart.thumbUrl} alt="" className="h-full w-full bg-white object-cover" />
        ) : (
          <BookOpen className="h-6 w-6" aria-hidden />
        )}
      </QuickActionTile>
      <QuickActionText title="Continue your book" detail={detail} />
      <QuickActionArrow />
    </Link>
  );
}

/** Phones only (desktop has the orders column): opens the Orders tab. */
function OrdersToTrackAction({ orders }: { orders: BookOrderSummary[] }) {
  const needsPayment = orders.some((o) => isUnpaid(o));
  return (
    <Link href="/orders" className={QUICK_ACTION_ROW}>
      <QuickActionTile tone={needsPayment ? "warning" : "primary"}>
        <Truck className="h-6 w-6" aria-hidden />
      </QuickActionTile>
      <QuickActionText title="Orders to track" detail={ordersSummary(orders)} />
      <QuickActionArrow />
    </Link>
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
  const reloadCart = useCallback(async () => {
    const res = await api.listBookCarts();
    if (!api.isError(res)) setCart(res.data[0] ?? null);
  }, []);
  const removal = useAlbumRemoval({
    onRemoved: (removed) => {
      setProjects((prev) => prev?.filter((p) => p.id !== removed.id) ?? prev);
      // Its book can't be continued any more; show the next one in the cart, if any.
      setCart((prev) => (prev?.projectId === removed.id ? null : prev));
      void reloadAlbums();
      void reloadCart();
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

  const hasOrdersToTrack = !!orders && orders.length > 0;
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
              {/* Desktop: a column of its own for quick actions, with orders to track under them. */}
              {cart || orders ? (
                <div className="hidden min-w-0 space-y-8 lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1 lg:block">
                  {cart ? (
                    <section aria-labelledby="home-quick-actions-side">
                      <h2 id="home-quick-actions-side" className="v2-section-title mb-3">
                        Quick actions
                      </h2>
                      <ContinueBookAction cart={cart} />
                    </section>
                  ) : null}
                  {orders ? (
                    <aside aria-labelledby="home-orders" className="min-w-0">
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
                </div>
              ) : null}

              <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">
              {cart || hasOrdersToTrack ? (
                // Phones and tablets: desktop shows quick actions and orders in the right-hand column.
                <section aria-labelledby="home-quick-actions" className="lg:hidden">
                  <h2 id="home-quick-actions" className="v2-section-title mb-3">
                    Quick actions
                  </h2>
                  <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                    {cart ? (
                      <li>
                        <ContinueBookAction cart={cart} />
                      </li>
                    ) : null}
                    {hasOrdersToTrack && orders ? (
                      <li>
                        <OrdersToTrackAction orders={orders} />
                      </li>
                    ) : null}
                  </ul>
                </section>
              ) : null}

              <V2HeardFromCard />

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
                            // The studio's list can be older than this page's (photos added since it
                            // loaded), so the card's own counts win: the dialog says what the card says.
                            const fresh = projectMetaFromLibrary(project);
                            const known = studio.projects.find((p) => p.id === project.id);
                            const meta = known
                              ? { ...known, name: fresh.name, photoCount: fresh.photoCount, sharedCount: fresh.sharedCount }
                              : fresh;
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
                      className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 text-sm font-semibold text-v2-link transition hover:border-v2-primary/40 hover:bg-v2-primary-light disabled:opacity-60"
                    >
                      {/* Same shape as an album card (4:3 collage + name and count), so the tile is
                          full size even when it sits alone on its row. */}
                      <span className="aspect-[4/3] w-full" aria-hidden />
                      <span className="invisible px-3 py-2.5 text-left" aria-hidden>
                        <span className="block font-semibold">&nbsp;</span>
                        <span className="block text-xs">&nbsp;</span>
                      </span>
                      <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
                        {creating ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />}
                        New album
                      </span>
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
