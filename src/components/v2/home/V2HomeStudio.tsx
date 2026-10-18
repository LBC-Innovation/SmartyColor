"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, CalendarHeart, FolderOpen, Loader2, Plus, Users } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { BOOK_ORDER_STEP_LABEL, type BookOrderStep } from "@/components/v2/book-order/BookOrderStepper";
import { V2YearAlbumModal } from "@/components/v2/home/V2YearAlbumModal";
import { useV2Toast } from "@/components/v2/V2Toast";
import { activeSeasonalPrompt } from "@/content/seasonalPrompt";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import * as library from "@/lib/library/client";
import type { LibraryProject } from "@/lib/library/types";
import type { BookCartSummary } from "@/lib/orders/cartTypes";
import { STUDIO_PATH } from "@/lib/v2/guestSession";

const CONTENT = "mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8";

function albumHref(projectId: string): string {
  return `${STUDIO_PATH}?album=${encodeURIComponent(projectId)}`;
}

function photoCountLabel(count: number): string {
  return count === 1 ? "1 photo" : `${count} photos`;
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
    void Promise.all([library.listProjects(), api.listBookCarts()]).then(([projectsRes, cartsRes]) => {
      if (cancelled) return;
      if (projectsRes.error) setLoadError(projectsRes.error.message);
      else setProjects(projectsRes.data!);
      // A missing cart list only hides the card.
      if (!cartsRes.error) setCart(cartsRes.data?.[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function createAlbum() {
    if (creating) return;
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
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-8">
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
            <div className="space-y-8">
              {cart ? (
                <section aria-label="Continue your book">
                  <Link
                    href={`/studio/order?cart=${cart.id}`}
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
                          `at ${BOOK_ORDER_STEP_LABEL[cart.step as BookOrderStep] ?? "the start"}`,
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
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <Link
                        href={albumHref(project.id)}
                        className="v2-panel flex h-full min-h-28 flex-col justify-between gap-3 p-4 transition hover:border-v2-primary/40"
                      >
                        {project.role === "contributor" ? (
                          <Users className="h-5 w-5 text-v2-primary" aria-label="Shared with you" />
                        ) : (
                          <FolderOpen className="h-5 w-5 text-v2-primary" aria-hidden />
                        )}
                        <span className="min-w-0">
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
