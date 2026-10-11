"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { BookAlbumSelect } from "@/components/v2/book-order/BookAlbumSelect";
import { BookBindingPicker } from "@/components/v2/book-order/BookBindingPicker";
import { BookFlipThroughModal } from "@/components/v2/book-order/BookFlipThroughModal";
import { BookOrderConfirmModal } from "@/components/v2/book-order/BookOrderConfirmModal";
import { BookOrderPriceBar } from "@/components/v2/book-order/BookOrderPriceBar";
import { BookOrderStepper, type BookOrderStep } from "@/components/v2/book-order/BookOrderStepper";
import { BookPageThumbnailGrid } from "@/components/v2/book-order/BookPageThumbnailGrid";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import { getBookBinding, recommendBinding, type BookBindingId } from "@/lib/print/bookBindings";
import { computeBookPagePlan, explainBookPagePadding, nextRotation } from "@/lib/print/bookPagePlan";
import type { BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import { readStoredQuoteShippingZip } from "@/lib/print/quoteShippingZip";
import { BookShippingAddressForm } from "@/components/v2/book-order/BookShippingAddressForm";
import {
  EMPTY_SHIPPING_ADDRESS,
  isShippingAddressComplete,
  normalizeShippingAddress,
  validateShippingAddress,
  type ShippingAddressErrors,
} from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";

const ADDRESS_STORAGE_KEY = "cm_shipping_address";

function readStoredAddress(): ShippingAddress {
  if (typeof window === "undefined") return EMPTY_SHIPPING_ADDRESS;
  try {
    const raw = localStorage.getItem(ADDRESS_STORAGE_KEY);
    return raw ? { ...EMPTY_SHIPPING_ADDRESS, ...(JSON.parse(raw) as Partial<ShippingAddress>) } : EMPTY_SHIPPING_ADDRESS;
  } catch {
    return EMPTY_SHIPPING_ADDRESS;
  }
}

function storeAddress(address: ShippingAddress) {
  try {
    localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(address));
  } catch {
    /* ignore */
  }
}
import {
  collectPhotoPagesFromProjects,
  countProjectSheets,
  loadProjectsCatalog,
} from "@/lib/v2/loadAlbumPagesForBook";
import type { V2ProjectMeta } from "@/lib/v2/studioTypes";

const STEPS: BookOrderStep[] = ["pages", "book", "review"];

export function V2BookOrderWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [step, setStep] = useState<BookOrderStep>("pages");
  const [projects, setProjects] = useState<V2ProjectMeta[]>([]);
  const [sheetCounts, setSheetCounts] = useState<Record<string, number>>({});
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [photoPages, setPhotoPages] = useState<BookWizardPhotoPage[]>([]);
  /** Album selection the current photoPages were collected for. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const removedIdsRef = useRef<Set<string>>(new Set());

  const [bindingId, setBindingId] = useState<BookBindingId>("saddle_stitch");
  const [bindingTouched, setBindingTouched] = useState(false);

  // Only rendered on the review step, so reading storage up front can't mismatch SSR.
  // Legacy ZIP-only estimate, used until a full address is entered.
  const [shippingZip] = useState(() => readStoredQuoteShippingZip());
  const [address, setAddress] = useState<ShippingAddress>(() => readStoredAddress());
  const [addressErrors, setAddressErrors] = useState<ShippingAddressErrors>({});
  const addressComplete = isShippingAddressComplete(address);
  const [quoteCents, setQuoteCents] = useState<number | null>(null);
  const [printCents, setPrintCents] = useState<number | null>(null);
  const [shippingCents, setShippingCents] = useState<number | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [flipOpen, setFlipOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedDraftIdRef = useRef<string | null>(null);

  const binding = getBookBinding(bindingId);
  const plan = useMemo(() => computeBookPagePlan(photoPages, binding), [photoPages, binding]);
  const paddingNote = explainBookPagePadding(plan.photoCount, binding, plan);

  const selectedProjects = useMemo(
    () => projects.filter((p) => selectedProjectIds.includes(p.id)),
    [projects, selectedProjectIds],
  );
  const projectTitle =
    selectedProjects.length === 1 ? selectedProjects[0].name : "My coloring book";

  // ---- albums ------------------------------------------------------------

  const preselectId = searchParams.get("project");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadProjectsCatalog();
      if (cancelled) return;
      setProjects(list);
      setLoadingAlbums(false);
      // Start with the project the user came from, or the only one they have.
      const initial =
        (preselectId && list.some((p) => p.id === preselectId) && preselectId) ||
        (list.length === 1 ? list[0].id : null);
      if (initial) setSelectedProjectIds([initial]);

      const counts: Record<string, number> = {};
      for (const p of list) {
        counts[p.id] = await countProjectSheets(p.id);
      }
      if (!cancelled) setSheetCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [preselectId]);

  // Albums can be deleted in the studio; re-read the catalog when we come back.
  useEffect(() => {
    const refresh = () => {
      void loadProjectsCatalog().then((list) => {
        setProjects(list);
        setSelectedProjectIds((prev) => prev.filter((id) => list.some((p) => p.id === id)));
      });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // Re-collect pages whenever the album selection changes, keeping the
  // order, rotations and removals the user already made.
  const selectionKey = selectedProjectIds.join("|");
  const loadingPages = projects.length > 0 && loadedKey !== selectionKey;

  useEffect(() => {
    if (projects.length === 0) return;
    let cancelled = false;
    void collectPhotoPagesFromProjects({ projectIds: selectedProjectIds, projects }).then(
      ({ pages: collected }) => {
        if (cancelled) return;
        setPhotoPages((prev) => {
          const byId = new Map(collected.map((p) => [p.id, p]));
          const kept = prev.filter((p) => byId.has(p.id));
          const keptIds = new Set(kept.map((p) => p.id));
          const added = collected.filter(
            (p) => !keptIds.has(p.id) && !removedIdsRef.current.has(p.id),
          );
          return [...kept, ...added];
        });
        setLoadedKey(selectionKey);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedProjectIds, selectionKey, projects]);

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // ---- quote -------------------------------------------------------------

  const quoteActive = step !== "pages" && plan.totalPages >= 1;

  useEffect(() => {
    if (!quoteActive) return;
    const t = window.setTimeout(() => {
      void (async () => {
        setQuoteLoading(true);
        setQuoteError(null);
        const zip = (addressComplete ? address.postcode : shippingZip).trim();
        const result = await api.fetchOrderQuote({
          bindingId,
          pageCount: plan.totalPages,
          ...(addressComplete
            ? {
                shippingAddress: {
                  city: address.city,
                  state_code: address.state_code,
                  postcode: address.postcode,
                  country_code: address.country_code,
                },
              }
            : zip
              ? { shippingPostcode: zip }
              : {}),
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
  }, [quoteActive, bindingId, plan.totalPages, shippingZip, addressComplete, address.city, address.state_code, address.postcode, address.country_code]);

  function updateAddress(next: ShippingAddress) {
    setAddress(next);
    storeAddress(next);
    if (Object.keys(addressErrors).length > 0) setAddressErrors(validateShippingAddress(next));
  }

  // ---- navigation ----------------------------------------------------------

  const goNext = useCallback(() => {
    setError(null);
    if (step === "pages") {
      if (plan.photoCount === 0) {
        setError("Pick at least one album with a generated coloring sheet.");
        return;
      }
      if (!bindingTouched) setBindingId(recommendBinding(plan.photoCount));
      setStep("book");
    } else if (step === "book") {
      setStep("review");
    } else {
      const errors = validateShippingAddress(address);
      setAddressErrors(errors);
      if (Object.keys(errors).length > 0) {
        setError("Please complete the shipping address.");
        document.getElementById("ship-name")?.focus();
        return;
      }
      setConfirmOpen(true);
    }
  }, [step, plan.photoCount, bindingTouched, address]);

  function goBack() {
    setError(null);
    if (step === "review") setStep("book");
    else if (step === "book") setStep("pages");
    else router.push("/studio");
  }

  async function placeOrder() {
    setPlacing(true);
    setError(null);
    const shippingPostcode = shippingZip.trim() || null;
    const shippingAddress = normalizeShippingAddress(address);
    let orderId = savedDraftIdRef.current;

    if (orderId) {
      const updated = await api.updateDraftBookOrder(orderId, {
        bindingId,
        pageCount: plan.totalPages,
        projectTitle,
        estimatedTotalCents: quoteCents,
        shippingPostcode,
        shippingAddress,
      });
      if (api.isError(updated)) {
        setError(updated.error.message);
        setPlacing(false);
        return;
      }
    } else {
      const created = await api.createDraftBookOrder({
        bindingId,
        pageCount: plan.totalPages,
        photoCount: plan.photoCount,
        blankCount: plan.blankCount,
        projectTitle,
        estimatedTotalCents: quoteCents,
        shippingPostcode,
        shippingAddress,
      });
      if (api.isError(created)) {
        setError(created.error.message);
        setPlacing(false);
        return;
      }
      orderId = created.data.orderId;
      savedDraftIdRef.current = orderId;
    }

    const confirmed = await api.confirmDraftBookOrder(orderId);
    setPlacing(false);
    if (api.isError(confirmed)) {
      setError(confirmed.error.message);
      return;
    }
    setConfirmOpen(false);
    router.push(`/orders/${orderId}?confirmed=1`);
  }

  // ---- render --------------------------------------------------------------

  const nextLabel =
    step === "pages" ? "Choose binding" : step === "book" ? "Review order" : "Place order";
  const nextDisabled =
    (step === "pages" && (plan.photoCount === 0 || loadingPages)) ||
    (step === "review" && placing);

  return (
    <V2StudioFrame hideBottomNav>
      <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-200 bg-white">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-4">
            <h1 className="v2-brand-title text-xl tracking-tight text-v2-ink sm:text-2xl">
              Order a coloring book
            </h1>
            <BookOrderStepper steps={STEPS} current={step} />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-8 sm:py-6">
            {authLoading ? (
              <p className="text-sm text-v2-muted">Loading…</p>
            ) : !user ? (
              <div className="v2-panel p-6 text-center">
                <p className="text-sm text-v2-muted">Sign in to order a printed book.</p>
                <Link href="/sign-in?next=/studio/order" className="v2-btn-primary mt-4">
                  Sign in
                </Link>
              </div>
            ) : (
              <>
                {error ? (
                  <div
                    className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                    role="alert"
                  >
                    {error}
                  </div>
                ) : null}

                {step === "pages" ? (
                  <section className="space-y-4" aria-label="Choose pages">
                    <div>
                      <h2 className="text-base font-semibold text-v2-ink">
                        Which albums go in the book?
                      </h2>
                      <p className="mt-0.5 text-sm text-v2-muted">
                        Toggle albums on or off. Only photos with a coloring sheet become pages.
                      </p>
                    </div>

                    {!loadingAlbums && projects.length === 0 ? (
                      <div className="v2-panel p-5 text-sm text-v2-muted">
                        Create a project in the studio and generate coloring sheets first.
                      </div>
                    ) : (
                      <BookAlbumSelect
                        className="sm:max-w-md"
                        projects={projects}
                        sheetCounts={sheetCounts}
                        selectedIds={selectedProjectIds}
                        onToggle={toggleProject}
                        loading={loadingAlbums}
                      />
                    )}

                    {loadingPages ? (
                      <p className="flex items-center gap-2 text-sm text-v2-muted">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Loading pages…
                      </p>
                    ) : photoPages.length > 0 ? (
                      <BookPageThumbnailGrid
                        binding={binding}
                        pages={photoPages}
                        onReorder={(next) => {
                          setPhotoPages(
                            next.filter((p): p is BookWizardPhotoPage => p.kind === "photo"),
                          );
                        }}
                        onFlipPhoto={(id) =>
                          setPhotoPages((prev) =>
                            prev.map((p) =>
                              p.id === id ? { ...p, rotation: nextRotation(p.rotation) } : p,
                            ),
                          )
                        }
                        onRemovePhoto={(id) => {
                          removedIdsRef.current.add(id);
                          setPhotoPages((prev) => prev.filter((p) => p.id !== id));
                        }}
                      />
                    ) : selectedProjectIds.length > 0 ? (
                      <div className="v2-panel p-5 text-sm text-v2-muted">
                        None of these photos has a coloring sheet yet. Go back to the studio and
                        tap <span className="font-semibold text-v2-ink">Generate</span> first.
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {step === "book" ? (
                  <section className="space-y-5" aria-label="Choose binding">
                    <div>
                      <h2 className="text-base font-semibold text-v2-ink">How should it be bound?</h2>
                      <p className="mt-0.5 text-sm text-v2-muted">
                        8.5 × 11″ · black &amp; white interior · portrait. Each printed side counts
                        as one page.
                      </p>
                    </div>
                    <BookBindingPicker
                      photoCount={plan.photoCount}
                      value={bindingId}
                      onChange={(id) => {
                        setBindingTouched(true);
                        setBindingId(id);
                      }}
                    />
                    <button
                      type="button"
                      className="v2-btn-outline w-full sm:w-auto"
                      onClick={() => setFlipOpen(true)}
                      disabled={plan.allPages.length === 0}
                    >
                      <BookOpen className="h-4 w-4" aria-hidden />
                      Preview the book
                    </button>
                  </section>
                ) : null}

                {step === "review" ? (
                  <section className="grid gap-4 lg:grid-cols-[18rem_1fr]" aria-label="Review order">
                    <div className="v2-panel p-5 sm:p-6">
                      <h2 className="text-base font-semibold text-v2-ink">Your book</h2>
                      <dl className="mt-4 divide-y divide-gray-100 text-sm">
                        <Row label="Title" value={projectTitle} />
                        <Row label="Binding" value={binding.shortLabel} />
                        <Row
                          label="Pages"
                          value={`${plan.totalPages} (${plan.photoCount} coloring${
                            plan.blankCount > 0 ? `, ${plan.blankCount} blank` : ""
                          })`}
                        />
                        {selectedProjects.length > 1 ? (
                          <Row label="Albums" value={selectedProjects.map((p) => p.name).join(", ")} />
                        ) : null}
                      </dl>
                      {paddingNote ? (
                        <p className="mt-3 text-xs leading-snug text-amber-800">{paddingNote}.</p>
                      ) : null}
                      <button
                        type="button"
                        className="v2-btn-outline mt-5 w-full sm:w-auto"
                        onClick={() => setFlipOpen(true)}
                      >
                        <BookOpen className="h-4 w-4" aria-hidden />
                        Preview the book
                      </button>
                    </div>

                    <div className="v2-panel p-5 sm:p-6">
                      <h2 className="text-base font-semibold text-v2-ink">Ship to</h2>
                      <p className="mt-0.5 text-xs text-v2-muted">
                        Where the printer should mail your book.
                      </p>
                      <BookShippingAddressForm
                        className="mt-4"
                        value={address}
                        onChange={updateAddress}
                        errors={addressErrors}
                      />

                      <h2 className="mt-6 text-base font-semibold text-v2-ink">Price</h2>
                      {!addressComplete ? (
                        <p className="mt-1 text-xs text-v2-muted">
                          Shipping is estimated until the address above is complete.
                        </p>
                      ) : null}
                      <dl className="mt-4 space-y-1.5 text-sm">
                        <Money label="Printing" cents={printCents} loading={quoteLoading} />
                        <Money label="Shipping" cents={shippingCents} loading={quoteLoading} />
                        <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
                          <dt className="font-semibold text-v2-ink">Total</dt>
                          <dd className="text-lg font-bold tabular-nums text-v2-ink">
                            {quoteLoading ? "…" : quoteCents != null ? formatCredits(quoteCents) : "—"}
                          </dd>
                        </div>
                      </dl>
                      {quoteError ? (
                        <p className="mt-2 text-xs leading-snug text-amber-800">{quoteError}</p>
                      ) : null}
                      <p className="mt-3 text-xs text-v2-muted">
                        You&apos;ll pay from your credits on the next screen.
                      </p>
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>

        {user ? (
          <BookOrderPriceBar
            step={step}
            totalCents={quoteCents}
            quoteLoading={quoteLoading}
            pageCount={plan.totalPages}
            photoCount={plan.photoCount}
            backLabel={step === "pages" ? "Studio" : "Back"}
            nextLabel={nextLabel}
            nextDisabled={nextDisabled}
            busy={placing || (step === "pages" && loadingPages)}
            onBack={goBack}
            onNext={goNext}
          />
        ) : null}
      </main>

      {flipOpen ? (
        <BookFlipThroughModal pages={plan.allPages} binding={binding} onClose={() => setFlipOpen(false)} />
      ) : null}

      <BookOrderConfirmModal
        open={confirmOpen}
        busy={placing}
        projectTitle={projectTitle}
        binding={binding}
        pageCount={plan.totalPages}
        photoCount={plan.photoCount}
        totalCents={quoteCents}
        shippingZip={shippingZip}
        shippingAddress={address}
        onCancel={() => !placing && setConfirmOpen(false)}
        onConfirm={() => void placeOrder()}
      />
    </V2StudioFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-v2-muted">{label}</dt>
      <dd className="min-w-0 text-right font-semibold text-v2-ink">{value}</dd>
    </div>
  );
}

function Money({ label, cents, loading }: { label: string; cents: number | null; loading: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-v2-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-v2-ink">
        {loading ? "…" : cents != null ? formatCredits(cents) : "—"}
      </dd>
    </div>
  );
}
