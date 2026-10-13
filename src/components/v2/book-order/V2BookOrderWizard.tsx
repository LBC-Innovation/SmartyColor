"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { BookAlbumSelect } from "@/components/v2/book-order/BookAlbumSelect";
import { BookBindingPicker, type BindingQuote } from "@/components/v2/book-order/BookBindingPicker";
import { V2AddCreditModal } from "@/components/v2/credits/V2AddCreditModal";
import { useCreditCheckoutReturn } from "@/components/v2/credits/useCreditCheckoutReturn";
import { useV2Toast } from "@/components/v2/V2Toast";
import { BookFlipThroughModal } from "@/components/v2/book-order/BookFlipThroughModal";
import { BookOrderConfirmModal } from "@/components/v2/book-order/BookOrderConfirmModal";
import { BookOrderPriceBar } from "@/components/v2/book-order/BookOrderPriceBar";
import { BookOrderStepper, type BookOrderStep } from "@/components/v2/book-order/BookOrderStepper";
import { BookPageThumbnailGrid } from "@/components/v2/book-order/BookPageThumbnailGrid";
import { cn } from "@/lib/cn";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import { DIGITAL_BOOK_CENTS } from "@/lib/credits/pricing";
import {
  getBookFormat,
  isDigitalFormat,
  recommendBinding,
  type BookFormatId,
} from "@/lib/print/bookBindings";
import { printRotationForBookPage } from "@/lib/print/bookPageImageFit";
import {
  computeBookPagePlan,
  contentPageCount,
  explainBookPagePadding,
  insertAfterContent,
} from "@/lib/print/bookPagePlan";
import type { BookWizardPage } from "@/lib/print/bookWizardTypes";
import { readStoredQuoteShippingZip } from "@/lib/print/quoteShippingZip";
import { BookShippingAddressForm } from "@/components/v2/book-order/BookShippingAddressForm";
import {
  EMPTY_SHIPPING_ADDRESS,
  isShippingAddressComplete,
  normalizeShippingAddress,
  validateShippingAddress,
  type ShippingAddressErrors,
} from "@/lib/orders/shippingAddress";
import type { DigitalBookPage, ShippingAddress } from "@/lib/orders/types";

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

// Binding first: it decides whether the book needs padded pages at all.
const STEPS: BookOrderStep[] = ["book", "pages", "review"];

export function V2BookOrderWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const cloud = Boolean(user);
  const toast = useV2Toast();

  const [step, setStep] = useState<BookOrderStep>("book");
  const [projects, setProjects] = useState<V2ProjectMeta[]>([]);
  const [sheetCounts, setSheetCounts] = useState<Record<string, number>>({});
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  /** Every page in book order: photos plus any blank or lined pages the user placed. */
  const [bookPages, setBookPages] = useState<BookWizardPage[]>([]);
  /** Album selection the current bookPages were collected for. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const removedIdsRef = useRef<Set<string>>(new Set());

  const [chosenBindingId, setBindingId] = useState<BookFormatId>(() => {
    const fromUrl = searchParams.get("binding");
    return fromUrl === "perfect_bound" || fromUrl === "saddle_stitch" || fromUrl === "digital"
      ? fromUrl
      : "saddle_stitch";
  });
  const [bindingTouched, setBindingTouched] = useState(false);

  // Only rendered on the review step, so reading storage up front can't mismatch SSR.
  // Legacy ZIP-only estimate, used until a full address is entered.
  const [shippingZip] = useState(() => readStoredQuoteShippingZip());
  const [address, setAddress] = useState<ShippingAddress>(() => readStoredAddress());
  const [addressErrors, setAddressErrors] = useState<ShippingAddressErrors>({});
  const addressComplete = isShippingAddressComplete(address);
  const [printQuote, setPrintQuote] = useState<BindingQuote | null>(null);
  const [addCreditShortfall, setAddCreditShortfall] = useState<number | null>(null);

  const [flipOpen, setFlipOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedDraftIdRef = useRef<string | null>(null);

  // An album too big for the stapled booklet moves up to paperback unless they picked it themselves.
  const bindingId: BookFormatId =
    !bindingTouched && chosenBindingId === "saddle_stitch" ? recommendBinding(contentPageCount(bookPages)) : chosenBindingId;
  const isDigital = isDigitalFormat(bindingId);
  const binding = getBookFormat(bindingId);
  const plan = useMemo(() => computeBookPagePlan(bookPages, binding), [bookPages, binding]);
  const contentCount = contentPageCount(bookPages);
  const selectedQuote: BindingQuote | null = isDigital
    ? { totalCents: DIGITAL_BOOK_CENTS, printCents: null, shippingCents: null, loading: false, error: null }
    : printQuote;
  const quoteCents = selectedQuote?.totalCents ?? null;
  const printCents = selectedQuote?.printCents ?? null;
  const shippingCents = selectedQuote?.shippingCents ?? null;
  const quoteLoading = selectedQuote?.loading ?? false;
  const quoteError = selectedQuote?.error ?? null;
  const balanceCents = user?.creditsBalanceCents ?? null;
  const shortfallCents =
    balanceCents != null && quoteCents != null ? Math.max(0, quoteCents - balanceCents) : 0;
  const selectedAffordable = shortfallCents === 0;
  const overCapacity = contentCount > binding.maxPages;
  const paddingNote = explainBookPagePadding(contentCount, binding, {
    totalPages: plan.totalPages,
    blankCount: plan.paddingCount,
  });

  const selectedProjects = useMemo(
    () => projects.filter((p) => selectedProjectIds.includes(p.id)),
    [projects, selectedProjectIds],
  );
  const projectTitle =
    selectedProjects.length === 1 ? selectedProjects[0].name : "My coloring book";

  // ---- albums ------------------------------------------------------------

  const preselectId = searchParams.get("project");
  const jumpToStepRef = useRef<BookOrderStep | null>(
    searchParams.get("step") === "review" ? "review" : null,
  );

  useCreditCheckoutReturn({ creditedHint: "You can finish your order." });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadProjectsCatalog(cloud);
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
        counts[p.id] = await countProjectSheets(p.id, cloud);
      }
      if (!cancelled) setSheetCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [preselectId, cloud]);

  // Albums can be deleted in the studio; re-read the catalog when we come back.
  useEffect(() => {
    const refresh = () => {
      void loadProjectsCatalog(cloud).then((list) => {
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
  }, [cloud]);

  // Re-collect pages whenever the album selection changes, keeping the
  // order, rotations and removals the user already made.
  const selectionKey = selectedProjectIds.join("|");
  const loadingPages = projects.length > 0 && loadedKey !== selectionKey;

  useEffect(() => {
    if (projects.length === 0) return;
    let cancelled = false;
    void collectPhotoPagesFromProjects({ projectIds: selectedProjectIds, projects, cloud }).then(
      ({ pages: collected }) => {
        if (cancelled) return;
        setBookPages((prev) => {
          const byId = new Map(collected.map((p) => [p.id, p]));
          // Blank and lined pages stay put; photos stay only while their album is selected.
          const kept = prev.filter((p) => p.kind === "blank" || byId.has(p.id));
          const keptIds = new Set(kept.map((p) => p.id));
          const added = collected.filter(
            (p) => !keptIds.has(p.id) && !removedIdsRef.current.has(p.id),
          );
          return insertAfterContent(kept, added);
        });
        setLoadedKey(selectionKey);
        // Coming back from adding credit: resume on the review step.
        if (jumpToStepRef.current === "review" && collected.length > 0) {
          jumpToStepRef.current = null;
          setStep("review");
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectIds, selectionKey, projects]);

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function insertBlank(variant: "plain" | "lined") {
    const id = `${variant === "lined" ? "lined" : "blank"}-${crypto.randomUUID()}`;
    setBookPages((prev) => insertAfterContent(prev, [{ id, kind: "blank", variant }]));
  }

  // ---- quote -------------------------------------------------------------

  const quoteActive = step !== "book" && !isDigital && plan.totalPages >= 1 && !overCapacity;
  const quotePageCount = plan.totalPages;

  useEffect(() => {
    if (!quoteActive || isDigitalFormat(bindingId)) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      const zip = (addressComplete ? address.postcode : shippingZip).trim();
      const shipping = addressComplete
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
          : {};

      setPrintQuote((prev) => ({
        totalCents: null,
        printCents: null,
        shippingCents: null,
        error: null,
        ...prev,
        loading: true,
      }));
      void api
        .fetchOrderQuote({ bindingId, pageCount: quotePageCount, ...shipping })
        .then((result) => {
          if (cancelled) return;
          setPrintQuote(
            api.isError(result)
              ? { totalCents: null, printCents: null, shippingCents: null, loading: false, error: result.error.message }
              : {
                  totalCents: result.data.estimatedTotalCents,
                  printCents: result.data.printCents ?? null,
                  shippingCents: result.data.shippingCents ?? null,
                  loading: false,
                  error: result.data.quoteError ?? null,
                },
          );
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [quoteActive, bindingId, quotePageCount, shippingZip, addressComplete, address.city, address.state_code, address.postcode, address.country_code]);

  function updateAddress(next: ShippingAddress) {
    setAddress(next);
    storeAddress(next);
    if (Object.keys(addressErrors).length > 0) setAddressErrors(validateShippingAddress(next));
  }

  // ---- navigation ----------------------------------------------------------

  const goNext = useCallback(() => {
    setError(null);
    if (step === "book") {
      setStep("pages");
    } else if (step === "pages") {
      if (plan.photoCount === 0) {
        setError("Pick at least one album with a generated coloring sheet.");
        return;
      }
      setStep("review");
    } else {
      if (!isDigital) {
        const errors = validateShippingAddress(address);
        setAddressErrors(errors);
        if (Object.keys(errors).length > 0) {
          setError("Please complete the shipping address.");
          document.getElementById("ship-name")?.focus();
          return;
        }
      }
      setConfirmOpen(true);
    }
  }, [step, plan.photoCount, address, isDigital]);

  function goBack() {
    setError(null);
    if (step === "review") setStep("pages");
    else if (step === "pages") setStep("book");
    else router.push("/studio");
  }

  async function placeDigitalOrder() {
    setPlacing(true);
    setError(null);
    const pages: DigitalBookPage[] = [];
    for (const page of plan.allPages) {
      if (page.kind === "blank") {
        pages.push({ kind: "blank", variant: page.variant === "lined" ? "lined" : "plain" });
        continue;
      }
      if (!page.revisionId) {
        setError("One of your pages isn't saved to your library yet. Open it in the studio and try again.");
        setPlacing(false);
        setConfirmOpen(false);
        return;
      }
      pages.push({
        kind: "photo",
        revisionId: page.revisionId,
        rotation: printRotationForBookPage(page, binding) as 0 | 90 | 180 | 270,
        mirrored: page.mirrored === true,
      });
    }

    const created = await api.createDigitalBookOrder({ projectTitle, pages });
    if (api.isError(created)) {
      setError(created.error.message);
      setPlacing(false);
      setConfirmOpen(false);
      if (created.error.code === "INSUFFICIENT_CREDITS") void refreshUser();
      return;
    }
    const orderId = created.data.orderId;
    await refreshUser();
    const download = await api.downloadOrderPdf(orderId, projectTitle);
    setPlacing(false);
    setConfirmOpen(false);
    if (api.isError(download)) {
      toast.error(`${download.error.message} You can download it from My orders.`);
    }
    router.push(`/orders/${orderId}?purchased=1`);
  }

  async function placeOrder() {
    if (isDigital) {
      await placeDigitalOrder();
      return;
    }
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
    step === "book"
      ? "Choose pages"
      : step === "pages"
        ? "Review order"
        : isDigital
          ? `Buy PDF · ${formatCredits(DIGITAL_BOOK_CENTS)}`
          : "Place order";
  const nextDisabled =
    (step === "pages" && (plan.photoCount === 0 || loadingPages || overCapacity)) ||
    (step === "review" && (placing || quoteLoading || !selectedAffordable || quoteCents == null));

  return (
    <V2StudioFrame hideBottomNav>
      <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-200 bg-white">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-4">
            <h1 className="v2-brand-title text-xl tracking-tight text-v2-ink sm:text-2xl">
              Create a coloring book
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
                <p className="text-sm text-v2-muted">Sign in to create a book.</p>
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

                {step === "book" ? (
                  <section className="space-y-5" aria-label="Choose binding">
                    <div>
                      <h2 className="text-base font-semibold text-v2-ink">How do you want your book?</h2>
                      <p className="mt-0.5 text-sm text-v2-muted">
                        8.5 × 11″ · portrait. Pick this first — printed books need a set number
                        of pages, a PDF is exactly the pages you choose.
                      </p>
                    </div>
                    <BookBindingPicker
                      value={bindingId}
                      onChange={(id) => {
                        setBindingTouched(true);
                        setBindingId(id);
                      }}
                    />
                    {balanceCents != null ? (
                      <p className="text-xs text-v2-muted">
                        Your balance:{" "}
                        <span className="font-semibold tabular-nums text-v2-success-text">
                          {formatCredits(balanceCents)}
                        </span>
                        {" · "}
                        <button
                          type="button"
                          className="font-semibold text-v2-link hover:underline"
                          onClick={() => setAddCreditShortfall(0)}
                        >
                          Add credit
                        </button>
                      </p>
                    ) : null}
                  </section>
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
                    ) : plan.photoCount > 0 ? (
                      <BookPageThumbnailGrid
                        binding={binding}
                        pages={plan.allPages}
                        onReorder={setBookPages}
                        onMirrorPhoto={(id) =>
                          setBookPages((prev) =>
                            prev.map((p) =>
                              p.kind === "photo" && p.id === id ? { ...p, mirrored: !p.mirrored } : p,
                            ),
                          )
                        }
                        onRemovePage={(id) => {
                          removedIdsRef.current.add(id);
                          setBookPages((prev) => prev.filter((p) => p.id !== id));
                        }}
                        onInsertBlank={() => insertBlank("plain")}
                        onInsertLined={() => insertBlank("lined")}
                      />
                    ) : selectedProjectIds.length > 0 ? (
                      <div className="v2-panel p-5 text-sm text-v2-muted">
                        None of these photos has a coloring sheet yet. Go back to the studio and
                        tap <span className="font-semibold text-v2-ink">Generate</span> first.
                      </div>
                    ) : null}

                    {overCapacity ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
                        {binding.shortLabel} holds up to {binding.maxPages} pages and you have{" "}
                        {contentCount}. Remove some pages, or go back and pick a bigger format.
                      </p>
                    ) : paddingNote ? (
                      <p className="text-xs leading-snug text-amber-800">{paddingNote}.</p>
                    ) : null}

                    {plan.allPages.length > 0 ? (
                      <button
                        type="button"
                        className="v2-btn-outline w-full sm:w-auto"
                        onClick={() => setFlipOpen(true)}
                      >
                        <BookOpen className="h-4 w-4" aria-hidden />
                        Preview the book
                      </button>
                    ) : null}
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
                      {!isDigital ? (
                        <>
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
                        </>
                      ) : null}

                      <h2 className={cn("text-base font-semibold text-v2-ink", !isDigital && "mt-6")}>Price</h2>
                      {!isDigital && !addressComplete ? (
                        <p className="mt-1 text-xs text-v2-muted">
                          Shipping is estimated until the address above is complete.
                        </p>
                      ) : null}
                      <dl className="mt-4 space-y-1.5 text-sm">
                        {isDigital ? (
                          <Money label="Print-at-home PDF" cents={quoteCents} loading={false} />
                        ) : (
                          <>
                            <Money label="Printing" cents={printCents} loading={quoteLoading} />
                            <Money label="Shipping" cents={shippingCents} loading={quoteLoading} />
                          </>
                        )}
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
                      {shortfallCents > 0 ? (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                          <p>
                            You have{" "}
                            <span className="font-semibold tabular-nums">{formatCredits(balanceCents ?? 0)}</span>
                            {" "}— add{" "}
                            <span className="font-semibold tabular-nums">{formatCredits(shortfallCents)}</span>{" "}
                            more to continue.
                          </p>
                          <button
                            type="button"
                            className="v2-btn-primary mt-3 text-sm"
                            onClick={() => setAddCreditShortfall(shortfallCents)}
                          >
                            Add {formatCredits(shortfallCents)} credit
                          </button>
                        </div>
                      ) : null}
                      <p className="mt-3 text-xs text-v2-muted">
                        {isDigital
                          ? "Paid from your credits. Your PDF downloads right away, and you can download it again anytime from My orders."
                          : "You'll pay from your credits on the next screen."}
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
            backLabel={step === "book" ? "Studio" : "Back"}
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

      {addCreditShortfall != null ? (
        <V2AddCreditModal
          onClose={() => setAddCreditShortfall(null)}
          shortfallCents={addCreditShortfall}
          returnPath={`/studio/order?${new URLSearchParams({
            ...(selectedProjectIds[0] ? { project: selectedProjectIds[0] } : {}),
            step: "review",
            binding: bindingId,
          }).toString()}`}
        />
      ) : null}

      <BookOrderConfirmModal
        open={confirmOpen}
        busy={placing}
        projectTitle={projectTitle}
        binding={binding}
        digital={isDigital}
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
