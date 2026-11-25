"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, CalendarHeart, ImagePlus, Loader2, Package, Plus, Users } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2OrderTrackCard } from "@/components/v2/orders/V2OrderTrackCard";
import { isUnpaid } from "@/components/v2/orders/V2MyOrdersStudio";
import { V2YearAlbumModal } from "@/components/v2/home/V2YearAlbumModal";
import { V2HeardFromCard } from "@/components/v2/home/V2HeardFromCard";
import { useV2Toast } from "@/components/v2/V2Toast";
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
 * Where signed-in people land: the book they were making (if any), their albums, and the
 * seasonal prompt, in that order. Guests have no albums on the server, so they go to the studio.
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
                  {projects.map((project) => (
                    <li key={project.id}>
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

              {seasonal ? (
                <section aria-label={seasonal.title}>
                  <div className="v2-panel flex flex-col gap-4 bg-gradient-to-br from-v2-primary-light to-white p-5 sm:flex-row sm:items-center sm:p-6">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-v2-primary shadow-sm">
                      <CalendarHeart className="h-6 w-6" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-v2-ink">{seasonal.title}</h2>
                      <p className="mt-1 text-sm leading-relaxed text-v2-muted">{seasonal.body}</p>
                    </div>
                    <button type="button" onClick={() => setYearAlbumOpen(true)} className="v2-btn-primary shrink-0">
                      {seasonal.cta}
                    </button>
                  </div>
                </section>
              ) : null}
              </div>
            </div>
          )}
        </div>
      </main>

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
