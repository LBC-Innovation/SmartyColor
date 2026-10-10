"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, Loader2 } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import {
  BookOrderWizardSidebar,
  BookOrderWizardSidebarMobile,
} from "@/components/v2/book-order/BookOrderWizardSidebar";
import { BookFlipThroughModal } from "@/components/v2/book-order/BookFlipThroughModal";
import { BookOrderConfirmModal } from "@/components/v2/book-order/BookOrderConfirmModal";
import { BookOrderReviewPanel } from "@/components/v2/book-order/BookOrderReviewPanel";
import { BookPageThumbnailGrid } from "@/components/v2/book-order/BookPageThumbnailGrid";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import {
  BOOK_BINDINGS,
  getBookBinding,
  type BookBindingId,
} from "@/lib/print/bookBindings";
import { computeBookPagePlan, nextRotation } from "@/lib/print/bookPagePlan";
import type { BookWizardPage, BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import {
  collectPhotoPagesFromProjects,
  loadProjectsCatalog,
} from "@/lib/v2/loadAlbumPagesForBook";
import type { V2ProjectMeta } from "@/lib/v2/studioTypes";
import { cn } from "@/lib/cn";
import { BOOK_PAGE_COUNT_HINT } from "@/lib/print/bookPageCountCopy";
import {
  readStoredQuoteShippingZip,
  storeQuoteShippingZip,
} from "@/lib/print/quoteShippingZip";

type WizardStep = "binding" | "albums" | "layout" | "review";

export function V2BookOrderWizard() {
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState<WizardStep>("binding");
  const [bindingId, setBindingId] = useState<BookBindingId>("perfect_bound");
  const [projects, setProjects] = useState<V2ProjectMeta[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [pages, setPages] = useState<BookWizardPage[]>([]);
  const [skippedWithoutSheet, setSkippedWithoutSheet] = useState(0);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [loadingPages, setLoadingPages] = useState(false);
  const [flipOpen, setFlipOpen] = useState(false);
  const [quoteCents, setQuoteCents] = useState<number | null>(null);
  const [printCents, setPrintCents] = useState<number | null>(null);
  const [shippingCents, setShippingCents] = useState<number | null>(null);
  const [shippingZip, setShippingZip] = useState("");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [savedDraftFingerprint, setSavedDraftFingerprint] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const binding = getBookBinding(bindingId);

  const plan = useMemo(
    () => computeBookPagePlan(
      pages.filter((p): p is BookWizardPhotoPage => p.kind === "photo"),
      binding,
    ),
    [pages, binding],
  );

  const displayPages = plan.allPages;

  const projectTitle = useMemo(() => {
    if (selectedProjectIds.length === 1) {
      return projects.find((p) => p.id === selectedProjectIds[0])?.name ?? "My coloring book";
    }
    return "My coloring book";
  }, [projects, selectedProjectIds]);

  const albumNames = useMemo(
    () =>
      projects
        .filter((p) => selectedProjectIds.includes(p.id))
        .map((p) => p.name),
    [projects, selectedProjectIds],
  );

  const draftFingerprint = useMemo(() => {
    const photos = pages.filter((p): p is BookWizardPhotoPage => p.kind === "photo");
    return JSON.stringify({
      bindingId,
      projectIds: [...selectedProjectIds].sort(),
      pages: photos.map((p) => ({ id: p.id, rotation: p.rotation })),
      totalPages: plan.totalPages,
      zip: shippingZip.trim(),
    });
  }, [bindingId, selectedProjectIds, pages, plan.totalPages, shippingZip]);

  const draftStale = Boolean(
    savedDraftId && savedDraftFingerprint && savedDraftFingerprint !== draftFingerprint,
  );

  const quoteStepActive =
    (step === "layout" || step === "review") && plan.totalPages >= 1;

  useEffect(() => {
    void loadProjectsCatalog().then((list) => {
      setProjects(list);
      setLoadingAlbums(false);
    });
  }, []);

  useEffect(() => {
    setShippingZip(readStoredQuoteShippingZip());
  }, []);

  function updateShippingZip(next: string) {
    setShippingZip(next);
    storeQuoteShippingZip(next);
  }

  useEffect(() => {
    if (!quoteStepActive) {
      setQuoteCents(null);
      setPrintCents(null);
      setShippingCents(null);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setQuoteLoading(true);
        setQuoteError(null);
        const trimmedZip = shippingZip.trim();
        const result = await api.fetchOrderQuote({
          bindingId,
          pageCount: plan.totalPages,
          ...(trimmedZip ? { shippingPostcode: trimmedZip } : {}),
        });
        setQuoteLoading(false);
        if (api.isError(result)) {
          setQuoteCents(null);
          setPrintCents(null);
          setShippingCents(null);
          setQuoteError(result.error.message);
          return;
        }
        setQuoteCents(result.data.estimatedTotalCents);
        setPrintCents(result.data.printCents ?? null);
        setShippingCents(result.data.shippingCents ?? null);
        setQuoteError(result.data.quoteError ?? null);
      })();
    }, 350);
    return () => window.clearTimeout(t);
  }, [bindingId, plan.totalPages, step, shippingZip]);

  const syncPagesFromPhotos = useCallback(
    (photos: BookWizardPhotoPage[]) => {
      const nextPlan = computeBookPagePlan(photos, binding);
      setPages(nextPlan.allPages);
    },
    [binding],
  );

  async function goToLayout() {
    if (selectedProjectIds.length === 0) {
      setError("Select at least one album.");
      return;
    }
    setError(null);
    setLoadingPages(true);
    const { pages: collected, skippedWithoutSheet: skipped } =
      await collectPhotoPagesFromProjects({
        projectIds: selectedProjectIds,
        projects,
      });
    setSkippedWithoutSheet(skipped);
    setLoadingPages(false);
    if (collected.length === 0) {
      setError(
        "No coloring pages found. Generate sheets in the studio before ordering.",
      );
      return;
    }
    syncPagesFromPhotos(collected);
    setStep("layout");
  }

  async function persistDraft(): Promise<string | null> {
    setError(null);
    const shippingPostcode = shippingZip.trim() || null;
    const draftBody = {
      bindingId,
      pageCount: plan.totalPages,
      photoCount: plan.photoCount,
      blankCount: plan.blankCount,
      projectTitle,
      estimatedTotalCents: quoteCents,
      shippingPostcode,
    };

    if (savedDraftId) {
      const result = await api.updateDraftBookOrder(savedDraftId, {
        bindingId,
        pageCount: plan.totalPages,
        projectTitle,
        estimatedTotalCents: quoteCents,
        shippingPostcode,
      });
      if (api.isError(result)) {
        setError(result.error.message);
        return null;
      }
      setSavedDraftFingerprint(draftFingerprint);
      return savedDraftId;
    }

    const result = await api.createDraftBookOrder(draftBody);
    if (api.isError(result)) {
      setError(result.error.message);
      return null;
    }
    setSavedDraftId(result.data.orderId);
    setSavedDraftFingerprint(draftFingerprint);
    return result.data.orderId;
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    setSaveMessage(null);
    const orderId = await persistDraft();
    setSavingDraft(false);
    if (orderId) {
      setSaveMessage("Draft saved. Confirm when you're ready to proceed to checkout.");
    }
  }

  async function handleConfirmOrder() {
    setConfirmingOrder(true);
    setError(null);
    const orderId = await persistDraft();
    if (!orderId) {
      setConfirmingOrder(false);
      return;
    }
    const result = await api.confirmDraftBookOrder(orderId);
    setConfirmingOrder(false);
    if (api.isError(result)) {
      setError(result.error.message);
      return;
    }
    setConfirmOpen(false);
    window.location.href = `/orders/${orderId}?confirmed=1`;
  }

  const sidebarCalculatorProps = {
    plan,
    binding,
    estimatedTotalCents: quoteCents,
    printCents,
    shippingCents,
    shippingZip,
    onShippingZipChange: updateShippingZip,
    quoteLoading,
    quoteError,
    quoteEnabled: quoteStepActive,
  };

  return (
    <V2StudioFrame
      sidebar={user ? <BookOrderWizardSidebar {...sidebarCalculatorProps} /> : null}
    >
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 sm:px-8 sm:py-6">
          <header className="mb-4 shrink-0 sm:mb-5">
            <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">
              Order a coloring book
            </h1>
            <p className="mt-2 text-sm text-v2-muted">
              {step === "binding"
                ? "Choose binding"
                : step === "albums"
                  ? "Choose albums"
                  : step === "layout"
                    ? "Arrange pages"
                    : "Review & confirm"}
            </p>
          </header>

          {authLoading ? (
            <p className="text-sm text-v2-muted">Loading…</p>
          ) : !user ? (
            <div className="v2-panel p-6 text-center">
              <p className="text-sm text-v2-muted">Sign in to order a printed book.</p>
              <Link href="/sign-in?next=/studio/order" className="mt-4 inline-flex v2-btn-primary">
                Sign in
              </Link>
            </div>
          ) : (
            <>
              {user ? <BookOrderWizardSidebarMobile {...sidebarCalculatorProps} /> : null}

              {error ? (
                <div className="mb-4 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {step === "binding" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain p-2 sm:p-4">
                <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center py-4">
                <div className="grid w-full gap-4 sm:grid-cols-2">
                  {(Object.keys(BOOK_BINDINGS) as BookBindingId[]).map((id) => {
                    const spec = BOOK_BINDINGS[id];
                    const selected = bindingId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setBindingId(id)}
                        className={cn(
                          "v2-panel rounded-xl border-2 p-5 text-left transition",
                          selected
                            ? "border-v2-primary"
                            : "border-transparent hover:border-v2-primary/25",
                          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-v2-primary",
                        )}
                      >
                        <p className="text-lg font-bold text-v2-ink">{spec.label}</p>
                        <p className="mt-2 text-sm text-v2-muted">{spec.description}</p>
                        <p className="mt-3 text-xs text-v2-muted">
                          {spec.minPages}–{spec.maxPages} pages
                          {spec.pageMultiple > 1
                            ? ` · multiples of ${spec.pageMultiple}`
                            : ""}{" "}
                          · portrait · 8.5×11″ B&amp;W
                        </p>
                        <p className="mt-2 text-[11px] leading-snug text-v2-muted">
                          {BOOK_PAGE_COUNT_HINT}
                        </p>
                      </button>
                    );
                  })}
                </div>
                </div>
                </div>
              ) : null}

              {step === "albums" ? (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1">
                <div className="max-w-2xl space-y-4">
                  {loadingAlbums ? (
                    <p className="text-sm text-v2-muted">Loading albums…</p>
                  ) : projects.length === 0 ? (
                    <p className="text-sm text-v2-muted">
                      Create a project in the studio and generate coloring sheets first.
                    </p>
                  ) : (
                    <ul className="v2-panel divide-y divide-gray-100">
                      {projects.map((project) => {
                        const checked = selectedProjectIds.includes(project.id);
                        return (
                          <li key={project.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-v2-primary"
                                checked={checked}
                                onChange={() => {
                                  setSelectedProjectIds((prev) =>
                                    checked
                                      ? prev.filter((id) => id !== project.id)
                                      : [...prev, project.id],
                                  );
                                }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-v2-ink">
                                  {project.name}
                                </span>
                                <span className="text-xs text-v2-muted">
                                  {project.photoCount} photos
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                </div>
              ) : null}

              {step === "layout" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                  {skippedWithoutSheet > 0 ? (
                    <p className="shrink-0 text-sm text-amber-800">
                      Skipped {skippedWithoutSheet} photo
                      {skippedWithoutSheet === 1 ? "" : "s"} without a generated coloring sheet.
                    </p>
                  ) : null}
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      className="v2-btn-sm v2-btn-sm-primary"
                      onClick={() => setFlipOpen(true)}
                      disabled={displayPages.length === 0}
                    >
                      <BookOpen className="h-4 w-4" aria-hidden />
                      Flip through
                    </button>
                  </div>
                  {loadingPages ? (
                    <div className="flex items-center gap-2 text-sm text-v2-muted">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Loading pages…
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1">
                      <BookPageThumbnailGrid
                        binding={binding}
                        pages={displayPages}
                        onReorder={(next) => {
                          const photos = next.filter(
                            (p): p is BookWizardPhotoPage => p.kind === "photo",
                          );
                          syncPagesFromPhotos(photos);
                        }}
                        onFlipPhoto={(pageId) => {
                          setPages((prev) =>
                            prev.map((p) =>
                              p.kind === "photo" && p.id === pageId
                                ? { ...p, rotation: nextRotation(p.rotation) }
                                : p,
                            ),
                          );
                        }}
                        onRemovePhoto={(pageId) => {
                          const photos = pages.filter(
                            (p): p is BookWizardPhotoPage =>
                              p.kind === "photo" && p.id !== pageId,
                          );
                          syncPagesFromPhotos(photos);
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : null}

              {step === "review" ? (
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain pr-1">
                  <BookOrderReviewPanel
                    projectTitle={projectTitle}
                    albumNames={albumNames}
                    reviewConfirmed={reviewConfirmed}
                    onReviewConfirmedChange={setReviewConfirmed}
                    savedDraftId={savedDraftId}
                    saveMessage={saveMessage}
                    draftStale={draftStale}
                  />
                  <button
                    type="button"
                    className="v2-btn-sm v2-btn-sm-primary"
                    onClick={() => setFlipOpen(true)}
                    disabled={displayPages.length === 0}
                  >
                    <BookOpen className="h-4 w-4" aria-hidden />
                    Flip through preview
                  </button>
                </div>
              ) : null}

              </div>

              <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 sm:mt-6 sm:pt-6">
                <button
                  type="button"
                  className="v2-btn-outline text-sm"
                  onClick={() => {
                    if (step === "review") setStep("layout");
                    else if (step === "layout") setStep("albums");
                    else if (step === "albums") setStep("binding");
                    else window.location.href = "/studio";
                  }}
                >
                  {step === "binding" ? "Back to studio" : "Back"}
                </button>
                {step === "binding" ? (
                  <button
                    type="button"
                    className="v2-btn-primary"
                    onClick={() => setStep("albums")}
                  >
                    Next: Albums
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                ) : step === "albums" ? (
                  <button
                    type="button"
                    className="v2-btn-primary"
                    disabled={loadingPages}
                    onClick={() => void goToLayout()}
                  >
                    {loadingPages ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : null}
                    Next: Arrange pages
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                ) : step === "layout" ? (
                  <button
                    type="button"
                    className="v2-btn-primary"
                    disabled={plan.photoCount === 0}
                    onClick={() => {
                      setReviewConfirmed(false);
                      setSaveMessage(null);
                      setStep("review");
                    }}
                  >
                    Next: Review
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className="v2-btn-outline text-sm"
                      disabled={savingDraft || confirmingOrder || plan.photoCount === 0}
                      onClick={() => void handleSaveDraft()}
                    >
                      {savingDraft ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : null}
                      Save draft
                    </button>
                    <button
                      type="button"
                      className="v2-btn-primary text-sm"
                      disabled={
                        !reviewConfirmed ||
                        savingDraft ||
                        confirmingOrder ||
                        plan.photoCount === 0
                      }
                      onClick={() => setConfirmOpen(true)}
                    >
                      Confirm &amp; order
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {flipOpen ? (
        <BookFlipThroughModal
          pages={displayPages}
          binding={binding}
          onClose={() => setFlipOpen(false)}
        />
      ) : null}

      <BookOrderConfirmModal
        open={confirmOpen}
        busy={confirmingOrder || savingDraft}
        projectTitle={projectTitle}
        binding={binding}
        pageCount={plan.totalPages}
        photoCount={plan.photoCount}
        totalCents={quoteCents}
        shippingZip={shippingZip}
        onCancel={() => !confirmingOrder && setConfirmOpen(false)}
        onConfirm={() => void handleConfirmOrder()}
      />
    </V2StudioFrame>
  );
}
