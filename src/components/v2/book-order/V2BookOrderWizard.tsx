"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Gift, Loader2 } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { BookAlbumSelect } from "@/components/v2/book-order/BookAlbumSelect";
import { BookCoverDesigner } from "@/components/v2/book-order/BookCoverDesigner";
import { BookPageFitPicker } from "@/components/v2/book-order/BookPageFitPicker";
import { BookPrintQualityNotice } from "@/components/v2/book-order/BookPrintQualityNotice";
import { BookProofStep } from "@/components/v2/book-order/BookProofStep";
import { useSoftPrintPages } from "@/components/v2/book-order/useSoftPrintPages";
import {
  coverSourcesFor,
  hasOriginalPhotos,
  useCoverPictures,
} from "@/components/v2/book-order/useCoverSources";
import {
  BookBindingPicker,
  type BindingQuote,
  type FormatPrice,
} from "@/components/v2/book-order/BookBindingPicker";
import { V2AddCreditModal } from "@/components/v2/credits/V2AddCreditModal";
import { useCreditCheckoutReturn } from "@/components/v2/credits/useCreditCheckoutReturn";
import { useV2Toast } from "@/components/v2/V2Toast";
import { BookFlipThroughModal } from "@/components/v2/book-order/BookFlipThroughModal";
import { BookOrderConfirmModal } from "@/components/v2/book-order/BookOrderConfirmModal";
import { BookOrderPriceBar } from "@/components/v2/book-order/BookOrderPriceBar";
import { BookOrderStepper, type BookOrderStep } from "@/components/v2/book-order/BookOrderStepper";
import { BookPageThumbnailGrid } from "@/components/v2/book-order/BookPageThumbnailGrid";
import { BookPendingPhotos } from "@/components/v2/book-order/BookPendingPhotos";
import { cn } from "@/lib/cn";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { authedFetch } from "@/lib/api/client";
import type { LibraryPhoto } from "@/lib/library/types";
import {
  BOOK_CARTS_CHANGED_EVENT,
  type BookCartInput,
  type BookCartPageEntry,
  type BookCartState,
} from "@/lib/orders/cartTypes";
import { formatCredits } from "@/lib/credits/money";
import { INSUFFICIENT_CREDITS_CODE, sheetUsageCostCents, unitPriceCents } from "@/lib/credits/pricing";
import { usePriceList } from "@/lib/pricing/usePriceList";
import {
  BOOK_BINDINGS,
  PRINT_BINDING_IDS,
  getBookFormat,
  isDigitalFormat,
  isPrintBindingId,
  type BookBindingId,
  type BookFormatId,
} from "@/lib/print/bookBindings";
import { defaultCoverDesign, normalizeCoverDesign, type BookCoverDesign } from "@/lib/print/bookCover";
import { clearCoverPictureCache, renderFrontCoverJpeg } from "@/lib/print/coverCanvas";
import { putToSignedUrl } from "@/lib/library/client";
import { printRotationForBookPage } from "@/lib/print/bookPageImageFit";
import {
  bestFitFormat,
  bookFormatFit,
  computeBookPagePlan,
  contentPageCount,
  explainBookPagePadding,
  insertAfterContent,
} from "@/lib/print/bookPagePlan";
import type { BookWizardPage, BookWizardPendingPhoto, BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import type { PageFit } from "@/lib/print/pageLayout";
import { readStoredQuoteShippingZip } from "@/lib/print/quoteShippingZip";
import { BookShippingAddressForm } from "@/components/v2/book-order/BookShippingAddressForm";
import {
  EMPTY_SHIPPING_ADDRESS,
  isShippingAddressComplete,
  normalizeShippingAddress,
  validateBillingAddress,
  validateShippingAddress,
  type ShippingAddressErrors,
} from "@/lib/orders/shippingAddress";
import type { DigitalBookPage, ShippingAddress } from "@/lib/orders/types";
import { centsToValue, trackFormat } from "@/lib/marketing/events";
import { track, trackPageGenerated, trackPurchaseOnce } from "@/lib/track";
import { HOLIDAY_LINE } from "@/content/marketing";
import { fillCopy } from "@/lib/marketing/copy";
import { holidayOrderBy } from "@/lib/marketing/holiday";

/** The customer's own address: billing, and where the book ships unless they say otherwise. */
const ADDRESS_STORAGE_KEY = "cm_shipping_address";
/** A separate delivery address, when the book ships somewhere else. */
const SHIP_TO_STORAGE_KEY = "cm_ship_to_address";
/** The banner shown when the customer's own address is incomplete: one address, or billing when shipping elsewhere. */
const OWN_ADDRESS_ERRORS = ["Please complete your address.", "Please complete your billing address."] as const;
const SHIP_TO_ADDRESS_ERROR = "Please complete the shipping address.";
/** Survives the trip to add credit and back, which reloads the wizard. */
const COVER_STORAGE_KEY = "cm_book_cover_design";

/**
 * The address being typed is a draft for this tab only, so it survives the trip
 * to add credit and back; keeping it for later orders is the customer's choice,
 * saved to their account.
 */
function readStoredAddress(key: string): ShippingAddress {
  if (typeof window === "undefined") return EMPTY_SHIPPING_ADDRESS;
  try {
    // Addresses used to be kept in this browser without asking; drop those.
    localStorage.removeItem(key);
    const raw = sessionStorage.getItem(key);
    return raw ? { ...EMPTY_SHIPPING_ADDRESS, ...(JSON.parse(raw) as Partial<ShippingAddress>) } : EMPTY_SHIPPING_ADDRESS;
  } catch {
    return EMPTY_SHIPPING_ADDRESS;
  }
}

/** Nothing typed yet: only the defaults, like the country, are set. */
function isBlankAddress(a: ShippingAddress): boolean {
  return (Object.keys(EMPTY_SHIPPING_ADDRESS) as (keyof ShippingAddress)[]).every(
    (k) => (a[k] ?? "").trim() === (EMPTY_SHIPPING_ADDRESS[k] ?? "").trim(),
  );
}

function storeAddress(key: string, address: ShippingAddress) {
  try {
    sessionStorage.setItem(key, JSON.stringify(address));
  } catch {
    /* ignore */
  }
}

function readStoredCover(): BookCoverDesign | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(COVER_STORAGE_KEY);
    return raw ? normalizeCoverDesign(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
import {
  bookEntryFromLibraryPhoto,
  collectPhotoPagesFromProjects,
  countProjectSheets,
  loadProjectsCatalog,
} from "@/lib/v2/loadAlbumPagesForBook";
import type { V2ProjectMeta } from "@/lib/v2/studioTypes";

// Album and format first: the album decides which formats it can fill, and the
// format decides whether the book needs padded pages at all. A printed book also
// gets a cover and a page-by-page check before checkout.
const PRINT_STEPS: BookOrderStep[] = ["book", "pages", "cover", "proof", "review"];
const DIGITAL_STEPS: BookOrderStep[] = ["book", "pages", "review"];
const ALL_STEPS: BookOrderStep[] = ["book", "pages", "cover", "proof", "review"];

function isStep(value: unknown): value is BookOrderStep {
  return typeof value === "string" && (ALL_STEPS as string[]).includes(value);
}

/** The pages as the cart remembers them: ids, order and turns, never the images. */
function cartPages(pages: BookWizardPage[]): BookCartPageEntry[] {
  return pages.map((p) =>
    p.kind === "photo"
      ? { id: p.id, kind: "photo", ...(p.rotation ? { rotation: p.rotation } : {}), ...(p.mirrored ? { mirrored: true } : {}) }
      : { id: p.id, kind: "blank", variant: p.variant === "lined" ? "lined" : "plain", ...(p.auto ? { auto: true } : {}) },
  );
}

/**
 * Rebuild a saved book from freshly collected pages: the saved order first,
 * then any sheets made since it was saved. Pages whose photo is gone drop out.
 */
function restoreCartPages(
  saved: BookCartPageEntry[],
  collected: BookWizardPhotoPage[],
  removed: Set<string>,
): BookWizardPage[] {
  const byId = new Map(collected.map((p) => [p.id, p]));
  const restored: BookWizardPage[] = [];
  for (const entry of saved) {
    if (entry.kind === "blank") {
      restored.push({ id: entry.id, kind: "blank", variant: entry.variant, ...(entry.auto ? { auto: true } : {}) });
      continue;
    }
    const page = byId.get(entry.id);
    if (page) restored.push({ ...page, rotation: entry.rotation ?? 0, mirrored: entry.mirrored });
  }
  const ids = new Set(restored.map((p) => p.id));
  return insertAfterContent(
    restored,
    collected.filter((p) => !ids.has(p.id) && !removed.has(p.id)),
  );
}

/** Put a newly drawn page where its photo sits in the album, among the pages already there. */
function insertInAlbumOrder(pages: BookWizardPage[], page: BookWizardPhotoPage, albumOrder: string[]): BookWizardPage[] {
  const rank = new Map(albumOrder.map((id, i) => [id, i]));
  const mine = rank.get(page.id);
  if (mine === undefined) return insertAfterContent(pages, [page]);
  const before = pages.findIndex(
    (p) => p.kind === "photo" && p.sourceProjectId === page.sourceProjectId && (rank.get(p.id) ?? -1) > mine,
  );
  if (before < 0) return insertAfterContent(pages, [page]);
  return [...pages.slice(0, before), page, ...pages.slice(before)];
}

type AiPayload = {
  photo?: LibraryPhoto;
  error?: string;
  code?: string;
  creditsBalanceCents?: number;
  costCents?: number;
  shortfallCents?: number;
};

/**
 * Remounts the wizard when the header's cart opens a different saved book,
 * but not when the wizard itself saves a new one and puts it in the URL.
 */
export function V2BookOrderWizardRoute() {
  const cartParam = useSearchParams().get("cart");
  /** Carts the mounted wizard created itself; their arrival in the URL is not a new book. */
  const [ownCarts] = useState(() => new Set<string>());
  const [instance, setInstance] = useState({ key: 0, cartParam });
  if (cartParam !== instance.cartParam) {
    const ours = cartParam !== null && ownCarts.has(cartParam);
    setInstance({ key: ours ? instance.key : instance.key + 1, cartParam });
  }
  return <V2BookOrderWizard key={instance.key} onCartCreated={(id) => ownCarts.add(id)} />;
}

export function V2BookOrderWizard({ onCartCreated }: { onCartCreated?: (cartId: string) => void } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, refreshUser, setCreditsBalance } = useAuth();
  const prices = usePriceList();
  // Unknown until the price list loads; the server charges the catalog price either way.
  const { digitalCents, generateCents, portraitCents } = useMemo(
    () => ({
      digitalCents: unitPriceCents(prices, "book.digital"),
      generateCents: sheetUsageCostCents(prices, "generation") ?? 0,
      portraitCents: sheetUsageCostCents(prices, "portrait") ?? 0,
    }),
    [prices],
  );
  const cloud = Boolean(user);
  const toast = useV2Toast();

  const [step, setStep] = useState<BookOrderStep>("book");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Each step starts at its top, whether reached by Next, Back or the stepper.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [step]);
  /** Steps reached so far; the stepper can jump back to any of them. */
  const [visited, setVisited] = useState<BookOrderStep[]>(["book"]);
  // ---- cart: the book is saved as it's built, so it can be picked up later ----
  const [initialCartId] = useState(() => searchParams.get("cart"));
  const [cartId, setCartId] = useState<string | null>(initialCartId);
  const cartIdRef = useRef<string | null>(initialCartId);
  /** True while a saved book is being read back; nothing is collected or saved until it is. */
  const [restoring, setRestoring] = useState(Boolean(initialCartId));
  const restorePagesRef = useRef<BookCartPageEntry[] | null>(null);
  /** Set once the book is ordered (or its cart removed), so nothing saves it again. */
  const cartClosedRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  /** Photos in the chosen albums with no coloring sheet yet. */
  const [pendingPhotos, setPendingPhotos] = useState<BookWizardPendingPhoto[]>([]);
  const albumOrderRef = useRef<string[]>([]);
  /** Photos with an AI job running, and what it is doing. */
  const [busyPhotos, setBusyPhotos] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<V2ProjectMeta[]>([]);
  const [sheetCounts, setSheetCounts] = useState<Record<string, number>>({});
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  /** Every page in book order: photos plus any blank or lined pages the user placed. */
  const [bookPages, setBookPages] = useState<BookWizardPage[]>([]);
  /** Album selection the current bookPages were collected for. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const removedIdsRef = useRef<Set<string>>(new Set());
  /** Coloring pages the user took out, so they can be put back from the first step. */
  const [removedPages, setRemovedPages] = useState<BookWizardPhotoPage[]>([]);
  /** Framed inside the margin, or filling the page edge to edge. One choice for the whole book. */
  const [pageFit, setPageFit] = useState<PageFit>("framed");
  const fittedPages = useMemo(
    () => bookPages.map((p) => (p.kind === "photo" ? { ...p, fit: pageFit } : p)),
    [bookPages, pageFit],
  );

  const [chosenBindingId, setBindingId] = useState<BookFormatId>(() => {
    const fromUrl = searchParams.get("binding");
    return isPrintBindingId(fromUrl) || fromUrl === "digital" ? fromUrl : "saddle_stitch";
  });
  const [bindingTouched, setBindingTouched] = useState(false);

  // Only rendered on the review step, so reading storage up front can't mismatch SSR.
  // Legacy ZIP-only estimate, used until a full address is entered.
  const [shippingZip] = useState(() => readStoredQuoteShippingZip());
  const [address, setAddress] = useState<ShippingAddress>(() => readStoredAddress(ADDRESS_STORAGE_KEY));
  const [addressErrors, setAddressErrors] = useState<ShippingAddressErrors>({});
  const [shipDifferent, setShipDifferent] = useState(false);
  const [shipTo, setShipTo] = useState<ShippingAddress>(() => readStoredAddress(SHIP_TO_STORAGE_KEY));
  /** "Save this address for future orders": on when the account already has one saved. */
  const [rememberAddress, setRememberAddress] = useState(false);
  const hadSavedAddressRef = useRef(false);
  const savedAddressLoadedRef = useRef(false);
  const [shipToErrors, setShipToErrors] = useState<ShippingAddressErrors>({});
  /** Where the book is delivered: the customer's own address unless they ship elsewhere. */
  const shippingAddress = shipDifferent ? shipTo : address;
  const addressComplete = isShippingAddressComplete(shippingAddress);

  /** Null until the customer changes something, so the cover text follows the book title. */
  // A saved book brings its own cover; otherwise only a trip to add credit leaves one behind.
  const [coverDraft, setCoverDraft] = useState<BookCoverDesign | null>(() =>
    searchParams.get("step") && !searchParams.get("cart") ? readStoredCover() : null,
  );
  /** The exact book (pages, cover, binding) the customer last confirmed in the proof step. */
  const [confirmedProofKey, setConfirmedProofKey] = useState<string | null>(null);
  const [printQuote, setPrintQuote] = useState<BindingQuote | null>(null);
  const [addCreditShortfall, setAddCreditShortfall] = useState<number | null>(null);

  const [flipOpen, setFlipOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedDraftIdRef = useRef<string | null>(null);

  const contentCount = contentPageCount(bookPages);
  const recommendedFormat = bestFitFormat(contentCount);
  // An album too big for the stapled booklet moves up to paperback unless they picked it themselves.
  const preferredBindingId: BookFormatId =
    !bindingTouched && chosenBindingId === "saddle_stitch" ? recommendedFormat : chosenBindingId;
  // While albums are still being chosen, a format the pages can't fill steps aside for
  // the best one that fits, and comes back if the pages grow into it again. Leaving the
  // first step locks the choice in, so editing pages later never swaps the binding.
  const bindingId: BookFormatId =
    step === "book" &&
    contentCount > 0 &&
    !bookFormatFit(contentCount, getBookFormat(preferredBindingId)).fits
      ? recommendedFormat
      : preferredBindingId;
  const isDigital = isDigitalFormat(bindingId);
  const binding = getBookFormat(bindingId);
  const holiday = holidayOrderBy();
  const holidayLine = holiday ? fillCopy(HOLIDAY_LINE, { date: holiday.label }) : null;
  const bookStartedRef = useRef(false);
  useEffect(() => {
    if (bookStartedRef.current || !user) return;
    bookStartedRef.current = true;
    track("book_started", { format: trackFormat(bindingId) });
  }, [user, bindingId]);
  const plan = useMemo(() => computeBookPagePlan(fittedPages, binding), [fittedPages, binding]);
  const softPrintPages = useSoftPrintPages(plan.allPages, binding);
  const formatFits = bookFormatFit(contentCount, binding).fits;
  const selectedQuote: BindingQuote | null = isDigital
    ? { totalCents: digitalCents, printCents: null, shippingCents: null, taxCents: null, loading: digitalCents == null, error: null }
    : printQuote;
  const quoteCents = selectedQuote?.totalCents ?? null;
  const printCents = selectedQuote?.printCents ?? null;
  const shippingCents = selectedQuote?.shippingCents ?? null;
  const taxCents = selectedQuote?.taxCents ?? null;
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

  // ---- cover and proof -----------------------------------------------------

  const steps = isDigital ? DIGITAL_STEPS : PRINT_STEPS;
  const coverDesign = useMemo(() => coverDraft ?? defaultCoverDesign(projectTitle), [coverDraft, projectTitle]);
  const { pictures: coverPictures, loading: coverPicturesLoading } = useCoverPictures(
    plan.allPages,
    coverDesign.imageSource,
  );
  const coverSources = useMemo(() => coverSourcesFor(coverDesign, coverPictures), [coverDesign, coverPictures]);
  const proofKey = useMemo(
    () =>
      JSON.stringify([
        bindingId,
        coverDesign,
        plan.allPages.map((p) => (p.kind === "photo" ? [p.id, p.rotation, p.mirrored === true, p.fit] : [p.variant ?? "plain"])),
      ]),
    [bindingId, coverDesign, plan.allPages],
  );
  const proofConfirmed = confirmedProofKey === proofKey;

  function updateCover(next: BookCoverDesign) {
    setCoverDraft(next);
    try {
      sessionStorage.setItem(COVER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => clearCoverPictureCache, []);

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
      // A saved book brings its own albums.
      const initial =
        (preselectId && list.some((p) => p.id === preselectId) && preselectId) ||
        (list.length === 1 ? list[0].id : null);
      if (initial && !initialCartId) setSelectedProjectIds([initial]);

      const counts: Record<string, number> = {};
      for (const p of list) {
        counts[p.id] = await countProjectSheets(p.id, cloud);
      }
      if (!cancelled) setSheetCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [preselectId, cloud, initialCartId]);

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
  const loadingPages = restoring || (projects.length > 0 && loadedKey !== selectionKey);

  useEffect(() => {
    if (projects.length === 0 || restoring) return;
    let cancelled = false;
    void collectPhotoPagesFromProjects({ projectIds: selectedProjectIds, projects, cloud }).then(
      ({ pages: collected, pending, albumOrder }) => {
        if (cancelled) return;
        albumOrderRef.current = albumOrder;
        setPendingPhotos(pending);
        const restore = restorePagesRef.current;
        restorePagesRef.current = null;
        if (restore) {
          setRemovedPages(collected.filter((p) => removedIdsRef.current.has(p.id)));
          setBookPages(restoreCartPages(restore, collected, removedIdsRef.current));
        } else setBookPages((prev) => {
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
        // Coming back from adding credit reloads the wizard. A print-at-home book
        // resumes at checkout; a printed one resumes at the page check, because
        // that confirmation has to be made on the book as it is now.
        if (jumpToStepRef.current === "review" && collected.length > 0) {
          jumpToStepRef.current = null;
          const resume = isDigitalFormat(chosenBindingId) ? "review" : "proof";
          setStep(resume);
          setVisited((prev) => [...new Set([...prev, ...(isDigitalFormat(chosenBindingId) ? DIGITAL_STEPS : PRINT_STEPS).slice(0, ALL_STEPS.indexOf(resume) + 1)])]);
        }
      },
      () => {
        if (cancelled) return;
        // Usually an album deleted in the studio since the list was read: drop it from
        // the selection, which collects again. Otherwise stop waiting and say so.
        setLoadedKey(selectionKey);
        void loadProjectsCatalog(cloud)
          .then((list) => {
            if (cancelled) return;
            const gone = selectedProjectIds.some((id) => !list.some((p) => p.id === id));
            // Only a changed list collects again; the same failure must not loop.
            if (!gone) {
              setError("We couldn't load the pages for that album. Please try again.");
              return;
            }
            setProjects(list);
            setSelectedProjectIds((prev) => prev.filter((id) => list.some((p) => p.id === id)));
          })
          .catch(() => setError("We couldn't load your albums. Please try again."));
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectIds, selectionKey, projects, restoring]);

  // Read a saved book back from the cart.
  useEffect(() => {
    if (!initialCartId || authLoading || !user) return;
    let cancelled = false;
    void api.fetchBookCart(initialCartId).then((result) => {
      if (cancelled) return;
      if (api.isError(result)) {
        // Start afresh; a new cart is made once the book gets going again.
        cartIdRef.current = null;
        setCartId(null);
        setError(
          result.error.code === "NOT_FOUND"
            ? "That book isn't in your cart anymore. You can start it again here."
            : "We couldn't open your saved book. Please try again.",
        );
        setRestoring(false);
        return;
      }
      const saved: BookCartState = result.data.state;
      const format = saved.bindingId === "digital" || isPrintBindingId(saved.bindingId) ? saved.bindingId : null;
      setSelectedProjectIds(Array.isArray(saved.selectedProjectIds) ? saved.selectedProjectIds : []);
      if (format) setBindingId(format);
      setBindingTouched(saved.bindingTouched === true);
      setPageFit(saved.pageFit === "full" ? "full" : "framed");
      removedIdsRef.current = new Set(Array.isArray(saved.removedIds) ? saved.removedIds : []);
      if (saved.coverDesign) setCoverDraft(normalizeCoverDesign(saved.coverDesign));
      setShipDifferent(saved.shipDifferent === true);
      restorePagesRef.current = Array.isArray(saved.pages) ? saved.pages : [];
      const reached = (Array.isArray(saved.visited) ? saved.visited : []).filter(isStep);
      setVisited(reached.length > 0 ? [...new Set<BookOrderStep>(["book", ...reached])] : ["book"]);
      // A printed book is checked page by page again before checkout.
      const resume: BookOrderStep = !isStep(saved.step)
        ? "book"
        : saved.step === "review" && !isDigitalFormat(format ?? "saddle_stitch")
          ? "proof"
          : saved.step;
      setStep(resume);
      setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initialCartId, authLoading, user]);

  const restorablePages = removedPages.filter((p) => selectedProjectIds.includes(p.sourceProjectId));

  function removePage(id: string) {
    removedIdsRef.current.add(id);
    const page = bookPages.find((p) => p.id === id);
    if (page?.kind === "photo") setRemovedPages((prev) => [...prev, page]);
    setBookPages((prev) => prev.filter((p) => p.id !== id));
  }

  function restoreRemovedPages() {
    const ids = new Set(restorablePages.map((p) => p.id));
    for (const id of ids) removedIdsRef.current.delete(id);
    setRemovedPages((prev) => prev.filter((p) => !ids.has(p.id)));
    setBookPages((prev) => insertAfterContent(prev, restorablePages));
  }

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
      const zip = (addressComplete ? shippingAddress.postcode : shippingZip).trim();
      const shipping = addressComplete
        ? {
            shippingAddress: {
              city: shippingAddress.city,
              state_code: shippingAddress.state_code,
              postcode: shippingAddress.postcode,
              country_code: shippingAddress.country_code,
            },
          }
        : zip
          ? { shippingPostcode: zip }
          : {};

      setPrintQuote((prev) => ({
        totalCents: null,
        printCents: null,
        shippingCents: null,
        taxCents: null,
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
              ? { totalCents: null, printCents: null, shippingCents: null, taxCents: null, loading: false, error: result.error.message }
              : {
                  totalCents: result.data.estimatedTotalCents,
                  printCents: result.data.printCents ?? null,
                  shippingCents: result.data.shippingCents ?? null,
                  taxCents: result.data.taxCents ?? null,
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
  }, [quoteActive, bindingId, quotePageCount, shippingZip, addressComplete, shippingAddress.city, shippingAddress.state_code, shippingAddress.postcode, shippingAddress.country_code]);

  // The customer's own address is a full delivery address unless they ship elsewhere.
  const validateOwnAddress = shipDifferent ? validateBillingAddress : validateShippingAddress;

  // ---- format prices (first screen) -----------------------------------------

  /** Printed size of the book in each format: the chosen pages, padded as that binding needs. */
  const formatPageCounts = useMemo(() => {
    const counts = {} as Record<BookBindingId, number>;
    for (const id of PRINT_BINDING_IDS) counts[id] = computeBookPagePlan(bookPages, BOOK_BINDINGS[id]).totalPages;
    return counts;
  }, [bookPages]);
  /** Book price before shipping and tax by `binding:pageCount`; null when no price came back. */
  const [formatQuotes, setFormatQuotes] = useState<Record<string, number | null>>({});
  const formatQuotesAsked = useRef(new Set<string>());

  useEffect(() => {
    if (step !== "book" || loadingAlbums || loadingPages || contentCount === 0) return;
    for (const id of PRINT_BINDING_IDS) {
      const pageCount = formatPageCounts[id];
      const key = `${id}:${pageCount}`;
      // Formats the pages don't fill aren't offered, so they don't need a price.
      if (!bookFormatFit(contentCount, BOOK_BINDINGS[id]).fits || formatQuotesAsked.current.has(key)) continue;
      formatQuotesAsked.current.add(key);
      void api.fetchOrderQuote({ bindingId: id, pageCount }).then((result) => {
        // Before tax: the quote address is only a placeholder here, so its tax would mislead.
        const book = api.isError(result) ? null : result.data.printCents;
        setFormatQuotes((prev) => ({ ...prev, [key]: book ?? null }));
      });
    }
  }, [step, loadingAlbums, loadingPages, contentCount, formatPageCounts]);

  const formatPrices = useMemo(() => {
    const prices: Partial<Record<BookBindingId, FormatPrice>> = {};
    for (const id of PRINT_BINDING_IDS) {
      const pageCount = formatPageCounts[id];
      const key = `${id}:${pageCount}`;
      prices[id] = {
        pageCount,
        bookCents: formatQuotes[key] ?? null,
        loading: !(key in formatQuotes),
        overCapacity: pageCount > BOOK_BINDINGS[id].maxPages,
      };
    }
    return prices;
  }, [formatPageCounts, formatQuotes]);

  // Prefill from the address saved to the account, unless this tab already has one typed in.
  useEffect(() => {
    if (!user || savedAddressLoadedRef.current) return;
    savedAddressLoadedRef.current = true;
    void api.fetchSavedAddress().then((result) => {
      if (api.isError(result) || !result.data) return;
      const saved = result.data;
      hadSavedAddressRef.current = true;
      setRememberAddress(true);
      setAddress((current) => (isBlankAddress(current) ? saved : current));
    });
  }, [user]);

  /** Keeps or forgets the customer's own address for next time, as the checkbox says. */
  function persistRememberedAddress() {
    if (rememberAddress) {
      hadSavedAddressRef.current = true;
      void api.saveAddress(normalizeShippingAddress(address));
    } else if (hadSavedAddressRef.current) {
      hadSavedAddressRef.current = false;
      void api.clearSavedAddress();
    }
  }

  function updateAddress(next: ShippingAddress) {
    setAddress(next);
    storeAddress(ADDRESS_STORAGE_KEY, next);
    if (Object.keys(addressErrors).length === 0) return;
    const errors = validateOwnAddress(next);
    setAddressErrors(errors);
    if (Object.keys(errors).length === 0) clearAddressError(OWN_ADDRESS_ERRORS);
  }

  function updateShipTo(next: ShippingAddress) {
    setShipTo(next);
    storeAddress(SHIP_TO_STORAGE_KEY, next);
    if (Object.keys(shipToErrors).length === 0) return;
    const errors = validateShippingAddress(next);
    setShipToErrors(errors);
    if (Object.keys(errors).length === 0) clearAddressError([SHIP_TO_ADDRESS_ERROR]);
  }

  /** Drops the banner once the address it was about is filled in, leaving any other message. */
  function clearAddressError(messages: readonly string[]) {
    setError((current) => (current != null && messages.includes(current) ? null : current));
  }

  // ---- navigation ----------------------------------------------------------

  const visiblePending = pendingPhotos.filter((p) => selectedProjectIds.includes(p.sourceProjectId));

  /** Whether the book is ready to move on past this step. */
  function stepDone(s: BookOrderStep): boolean {
    if (s === "book") return !loadingAlbums && !loadingPages && (contentCount > 0 || visiblePending.length > 0);
    if (s === "pages") return !loadingPages && plan.photoCount > 0 && !overCapacity;
    if (s === "proof") return proofConfirmed;
    return true;
  }

  /** Steps already reached can be reopened, as long as every step before them is still done. */
  function canOpenStep(target: BookOrderStep): boolean {
    const at = steps.indexOf(target);
    return at >= 0 && visited.includes(target) && steps.slice(0, at).every(stepDone);
  }

  function openStep(target: BookOrderStep) {
    setError(null);
    // Leaving the first step locks in the format shown as selected, including one picked for them.
    if (step === "book" && target !== "book" && contentCount > 0) {
      setBindingId(bindingId);
      setBindingTouched(true);
    }
    setStep(target);
    setVisited((prev) => (prev.includes(target) ? prev : [...prev, target]));
  }

  function goNext() {
    setError(null);
    if (step === "book" && contentCount === 0 && visiblePending.length === 0) {
      setError("Choose an album with at least one photo.");
      return;
    }
    if (step === "pages" && plan.photoCount === 0) {
      setError("Pick at least one album with a generated coloring sheet.");
      return;
    }
    if (step === "proof" && !proofConfirmed) {
      setError("Turn through every page, then tick the box to confirm your book.");
      return;
    }
    if (step !== "review") {
      openStep(steps[steps.indexOf(step) + 1] ?? "review");
      return;
    }
    if (!isDigital) {
      const errors = validateOwnAddress(address);
      const shipErrors = shipDifferent ? validateShippingAddress(shipTo) : {};
      setAddressErrors(errors);
      setShipToErrors(shipErrors);
      if (Object.keys(errors).length > 0) {
        setError(shipDifferent ? OWN_ADDRESS_ERRORS[1] : OWN_ADDRESS_ERRORS[0]);
        document.getElementById("ship-name")?.focus();
        return;
      }
      if (Object.keys(shipErrors).length > 0) {
        setError(SHIP_TO_ADDRESS_ERROR);
        document.getElementById("ship-to-name")?.focus();
        return;
      }
    }
    setConfirmOpen(true);
  }

  function goBack() {
    setError(null);
    const at = steps.indexOf(step);
    if (at > 0) setStep(steps[at - 1]);
    else router.push("/studio");
  }

  // ---- cart -----------------------------------------------------------------

  const cartInput = useMemo<BookCartInput>(() => {
    const firstPhoto = plan.allPages.find((p): p is BookWizardPhotoPage => p.kind === "photo");
    return {
      title: projectTitle,
      step,
      bindingId,
      pageCount: plan.totalPages,
      photoCount: plan.photoCount,
      thumbRevisionId: firstPhoto?.revisionId ?? null,
      state: {
        v: 1,
        step,
        visited,
        selectedProjectIds,
        bindingId,
        bindingTouched,
        pageFit,
        pages: cartPages(bookPages),
        removedIds: removedPages.map((p) => p.id),
        coverDesign: coverDraft,
        shipDifferent,
      },
    };
  }, [projectTitle, step, visited, bindingId, plan, selectedProjectIds, bindingTouched, pageFit, bookPages, removedPages, coverDraft, shipDifferent]);

  // Saved once the customer moves past the first step, and on every change after that.
  const cartReady = Boolean(user) && !restoring && !loadingPages && (cartId !== null || step !== "book");

  function saveCart(input: BookCartInput): Promise<void> {
    // One save at a time, so a new book is only ever created once.
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (cartClosedRef.current) return;
      const id = cartIdRef.current;
      if (id) {
        const updated = await api.updateBookCart(id, input);
        // Removed from the cart elsewhere: leave it removed.
        if (api.isError(updated) && updated.error.code === "NOT_FOUND") cartClosedRef.current = true;
      } else {
        const created = await api.createBookCart(input);
        if (api.isError(created)) return;
        cartIdRef.current = created.data.id;
        setCartId(created.data.id);
        onCartCreated?.(created.data.id);
        // A reload (or the trip to add credit) comes back to this book.
        const url = new URL(window.location.href);
        url.searchParams.set("cart", created.data.id);
        for (const key of ["project", "binding", "step"]) url.searchParams.delete(key);
        window.history.replaceState(window.history.state, "", url);
      }
      window.dispatchEvent(new Event(BOOK_CARTS_CHANGED_EVENT));
    });
    return saveChainRef.current;
  }

  useEffect(() => {
    if (!cartReady) return;
    const t = window.setTimeout(() => void saveCart(cartInput), 700);
    return () => window.clearTimeout(t);
    // saveCart only reads refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartReady, cartInput]);

  /** The book was ordered: it leaves the cart. */
  async function closeCart() {
    await saveChainRef.current;
    cartClosedRef.current = true;
    const id = cartIdRef.current;
    if (!id) return;
    await api.deleteBookCart(id);
    window.dispatchEvent(new Event(BOOK_CARTS_CHANGED_EVENT));
  }

  function openAddCredit(cents: number) {
    // The trip to add credit reloads the wizard; make sure it comes back to this book.
    if (cartReady) void saveCart(cartInput);
    setAddCreditShortfall(cents);
  }

  // ---- coloring sheets drawn right here ----------------------------------------

  /** True when the wallet covers it; otherwise opens add-credit and returns false. */
  function canAfford(cents: number): boolean {
    const balance = user?.creditsBalanceCents ?? 0;
    if (balance >= cents) return true;
    openAddCredit(cents - balance);
    return false;
  }

  /** One AI call on a library photo. Null when the wallet ran short (add-credit is open). */
  async function callPhotoAi(path: string, body: Record<string, unknown>): Promise<LibraryPhoto | null> {
    const response = await authedFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let payload: AiPayload;
    try {
      payload = (await response.json()) as AiPayload;
    } catch {
      throw new Error("The server sent an unexpected response. Please try again in a moment.");
    }
    if (typeof payload.creditsBalanceCents === "number") setCreditsBalance(payload.creditsBalanceCents);
    if (response.status === 402 && payload.code === INSUFFICIENT_CREDITS_CODE) {
      openAddCredit(payload.shortfallCents ?? payload.costCents ?? 0);
      return null;
    }
    if (!response.ok || !payload.photo) throw new Error(payload.error ?? "Something went wrong. Please try again.");
    return payload.photo;
  }

  async function runPhotoJob(id: string, label: string, job: () => Promise<void>) {
    if (busyPhotos[id]) return;
    setBusyPhotos((prev) => ({ ...prev, [id]: label }));
    try {
      await job();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusyPhotos((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  /** A fresh sheet goes in its photo's place: replacing the page it had, or joining the book. */
  async function placeSheet(id: string, photo: LibraryPhoto, projectId: string, projectName: string) {
    const entry = await bookEntryFromLibraryPhoto(photo, projectId, projectName);
    if (!("page" in entry)) throw new Error("No coloring sheet came back. Please try again.");
    const page = entry.page;
    removedIdsRef.current.delete(id);
    setPendingPhotos((prev) => prev.filter((p) => p.id !== id));
    setBookPages((prev) =>
      prev.some((p) => p.id === id)
        ? prev.map((p) => (p.id === id ? page : p))
        : insertInAlbumOrder(prev, page, albumOrderRef.current),
    );
  }

  function generateSheet(id: string) {
    const pending = pendingPhotos.find((p) => p.id === id);
    if (!pending || !canAfford(generateCents)) return;
    void runPhotoJob(id, "Drawing the coloring sheet…", async () => {
      const photo = await callPhotoAi("/api/photo-coloring", {
        mode: "generate-library",
        photoId: pending.photoId,
        ...(pending.sourceRevisionId ? { sourceRevisionId: pending.sourceRevisionId } : {}),
      });
      if (photo) {
        trackPageGenerated(true);
        await placeSheet(id, photo, pending.sourceProjectId, pending.sourceProjectName);
      }
    });
  }

  /** Redraw a landscape photo as a portrait sheet, making its portrait version first if it has none. */
  function makePortraitSheet(id: string) {
    const page = bookPages.find((p): p is BookWizardPhotoPage => p.kind === "photo" && p.id === id);
    const target = page ?? pendingPhotos.find((p) => p.id === id);
    if (!target) return;
    const known = target.portraitRevisionId;
    if (!canAfford(generateCents + (known ? 0 : portraitCents))) return;
    void runPhotoJob(id, known ? "Drawing the portrait sheet…" : "Making a portrait version…", async () => {
      let sourceRevisionId = known;
      if (!sourceRevisionId) {
        const withPortrait = await callPhotoAi("/api/photo-portrait", { photoId: target.photoId });
        if (!withPortrait) return;
        const portraitId = withPortrait.activeRevisionId ?? undefined;
        if (!portraitId) throw new Error("No portrait version came back. Please try again.");
        sourceRevisionId = portraitId;
        // Remember it, so trying again doesn't pay for a second portrait.
        setPendingPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, portraitRevisionId: portraitId } : p)));
        setBookPages((prev) =>
          prev.map((p) => (p.kind === "photo" && p.id === id ? { ...p, portraitRevisionId: portraitId } : p)),
        );
        setBusyPhotos((prev) => ({ ...prev, [id]: "Drawing the portrait sheet…" }));
      }
      const photo = await callPhotoAi("/api/photo-coloring", {
        mode: "generate-library",
        photoId: target.photoId,
        sourceRevisionId,
      });
      if (photo) {
        trackPageGenerated(true);
        await placeSheet(id, photo, target.sourceProjectId, target.sourceProjectName);
      }
    });
  }

  const generateHint = prices ? `Uses ${formatCredits(generateCents)} of credit` : "Uses credit";
  const portraitHint = prices
    ? `Makes a portrait version of the photo, then draws a new sheet from it. Uses up to ${formatCredits(
        generateCents + portraitCents,
      )} of credit.`
    : "Makes a portrait version of the photo, then draws a new sheet from it.";

  /** The book's pages as the server stores them, or null if one isn't saved to the library. */
  function pageManifest(): DigitalBookPage[] | null {
    const pages: DigitalBookPage[] = [];
    for (const page of plan.allPages) {
      if (page.kind === "blank") {
        pages.push({ kind: "blank", variant: page.variant === "lined" ? "lined" : "plain" });
        continue;
      }
      if (!page.revisionId) return null;
      pages.push({
        kind: "photo",
        revisionId: page.revisionId,
        rotation: printRotationForBookPage(page, binding) as 0 | 90 | 180 | 270,
        mirrored: page.mirrored === true,
        ...(page.fit === "full" ? { fit: "full" as const } : {}),
      });
    }
    return pages;
  }

  function failUnsavedPage() {
    setError("One of your pages isn't saved to your library yet. Open it in the studio and try again.");
    setPlacing(false);
    setConfirmOpen(false);
  }

  async function placeDigitalOrder() {
    setPlacing(true);
    setError(null);
    const pages = pageManifest();
    if (!pages) {
      failUnsavedPage();
      return;
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
    trackPurchaseOnce({
      value: centsToValue(quoteCents ?? created.data.creditsAppliedCents),
      currency: "USD",
      order_id: orderId,
      format: "digital",
      is_gift: false,
    });
    await closeCart();
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
    if (quoteCents != null) {
      track("checkout_started", {
        value: centsToValue(quoteCents),
        currency: "USD",
        page_count: plan.totalPages,
        format: trackFormat(bindingId),
        is_gift: false,
      });
    }
    if (isDigital) {
      await placeDigitalOrder();
      return;
    }
    setPlacing(true);
    setError(null);
    persistRememberedAddress();
    const pages = pageManifest();
    if (!pages) {
      failUnsavedPage();
      return;
    }
    const book = {
      shippingPostcode: shippingZip.trim() || null,
      shippingAddress: normalizeShippingAddress(shippingAddress),
      billingAddress: shipDifferent ? normalizeShippingAddress(address) : null,
      pages,
      coverDesign,
      proofConfirmed,
    };
    let orderId = savedDraftIdRef.current;

    if (orderId) {
      const updated = await api.updateDraftBookOrder(orderId, {
        bindingId,
        pageCount: plan.totalPages,
        projectTitle,
        ...book,
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
        ...book,
      });
      if (api.isError(created)) {
        setError(created.error.message);
        setPlacing(false);
        return;
      }
      orderId = created.data.orderId;
      savedDraftIdRef.current = orderId;
    }

    // The front cover goes up as a print-size image, drawn by the same code as the preview.
    const upload = await api.createOrderCoverUpload(orderId);
    if (api.isError(upload)) {
      setError(upload.error.message);
      setPlacing(false);
      return;
    }
    let coverImage: Blob;
    try {
      coverImage = await renderFrontCoverJpeg({
        design: coverDesign,
        sources: coverSources,
        bindingId,
        fontHost: document.querySelector(".v2-shell") ?? document.body,
      });
    } catch {
      setError("We couldn't prepare your cover. Please try again.");
      setPlacing(false);
      return;
    }
    const uploaded = await putToSignedUrl(upload.data, coverImage, "image/jpeg");
    if (api.isError(uploaded)) {
      setError("We couldn't save your cover. Please try again.");
      setPlacing(false);
      return;
    }

    const confirmed = await api.confirmDraftBookOrder(orderId);
    setPlacing(false);
    if (api.isError(confirmed)) {
      setError(confirmed.error.message);
      setConfirmOpen(false);
      return;
    }
    try {
      sessionStorage.removeItem(COVER_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    await closeCart();
    setConfirmOpen(false);
    router.push(`/orders/${orderId}?confirmed=1`);
  }

  // ---- render --------------------------------------------------------------

  const nextLabel =
    step === "book"
      ? "Arrange pages"
      : step === "pages"
        ? isDigital
          ? "Review order"
          : "Design cover"
        : step === "cover"
          ? "Check your book"
          : step === "proof"
            ? "Checkout"
            : isDigital
              ? digitalCents != null
                ? `Buy PDF · ${formatCredits(digitalCents)}`
                : "Buy PDF"
              : "Place order";
  const nextDisabled =
    (step === "book" && !stepDone("book")) ||
    (step === "pages" && (plan.photoCount === 0 || loadingPages || overCapacity)) ||
    (step === "cover" && coverPicturesLoading && coverDesign.layout !== "none") ||
    (step === "proof" && !proofConfirmed) ||
    (step === "review" && (placing || quoteLoading || !selectedAffordable || quoteCents == null));

  return (
    <V2StudioFrame hideBottomNav>
      <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-200 bg-white">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between sm:px-8 sm:py-4">
            <h1 className="v2-brand-title text-xl tracking-tight text-v2-ink sm:text-2xl">
              Create a coloring book
            </h1>
            <BookOrderStepper steps={steps} current={step} canOpen={canOpenStep} onSelect={openStep} />
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
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
                  <section className="space-y-8" aria-label="Choose album and format">
                    <div className="space-y-3">
                      <StepHeading
                        number={1}
                        title="Which album is this book for?"
                        hint="Every photo with a coloring sheet becomes a page. Pick more than one album to combine them."
                      />
                      {!loadingAlbums && projects.length === 0 ? (
                        <div className="v2-panel p-5 text-sm text-v2-muted">
                          Create an album in the studio and generate coloring sheets first.{" "}
                          <Link href="/studio" className="font-semibold text-v2-link hover:underline">
                            Go to the studio
                          </Link>
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
                      {restorablePages.length > 0 && !loadingPages ? (
                        <p className="text-xs text-v2-muted">
                          {restorablePages.length} page{restorablePages.length === 1 ? " you removed is" : "s you removed are"}{" "}
                          left out of this book.{" "}
                          <button
                            type="button"
                            className="font-semibold text-v2-link hover:underline"
                            onClick={restoreRemovedPages}
                          >
                            Put {restorablePages.length === 1 ? "it" : "them"} back
                          </button>
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <StepHeading
                        number={2}
                        title="How do you want your book?"
                        hint="8.5 × 11″ · portrait. Formats your pages can't fill are greyed out, so your book never ends in a stack of blank pages."
                        muted={contentCount === 0}
                      />
                      {loadingAlbums || loadingPages ? (
                        <p className="flex items-center gap-2 py-6 text-sm text-v2-muted" role="status">
                          <Loader2 className="h-4 w-4 animate-spin text-v2-primary" aria-hidden />
                          {loadingAlbums ? "Loading your albums…" : "Counting your pages…"}
                        </p>
                      ) : selectedProjectIds.length === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-gray-200 px-5 py-8 text-center text-sm text-v2-muted">
                          Choose an album above to see the books it can make.
                        </div>
                      ) : contentCount === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-gray-200 px-5 py-8 text-center text-sm text-v2-muted">
                          {selectedProjectIds.length === 1 ? "This album doesn't" : "These albums don't"} have
                          any coloring sheets yet.{" "}
                          {visiblePending.length > 0 ? (
                            <>
                              Continue to <span className="font-semibold text-v2-ink">Arrange pages</span> to
                              generate them, then come back here to pick a format.
                            </>
                          ) : (
                            <>
                              Open it in the studio and tap <span className="font-semibold text-v2-ink">Generate</span>{" "}
                              first.
                            </>
                          )}
                        </div>
                      ) : (
                        <BookBindingPicker
                          value={bindingId}
                          prices={formatPrices}
                          contentPageCount={contentCount}
                          recommendedId={recommendedFormat}
                          digitalPriceCents={digitalCents}
                          onChange={(id) => {
                            setBindingTouched(true);
                            setBindingId(id);
                          }}
                        />
                      )}
                    </div>
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
                          onClick={() => openAddCredit(0)}
                        >
                          Add credit
                        </button>
                      </p>
                    ) : null}
                  </section>
                ) : null}

                {step === "pages" ? (
                  <section className="space-y-4" aria-label="Arrange pages">
                    <div>
                      <h2 className="text-base font-semibold text-v2-ink">Arrange your pages</h2>
                      <p className="mt-0.5 text-sm text-v2-muted">
                        Drag to reorder, remove any you don&apos;t want, or add blank and lined pages.
                      </p>
                      <p className="mt-2 text-xs text-v2-muted">
                        <span className="font-semibold text-v2-navy">{binding.shortLabel}</span>
                        {selectedProjects.length > 0 ? (
                          <> from {selectedProjects.map((p) => p.name).join(", ")}</>
                        ) : null}
                        {" · "}
                        <button
                          type="button"
                          className="font-semibold text-v2-link hover:underline"
                          onClick={() => openStep("book")}
                        >
                          Change album or format
                        </button>
                      </p>
                    </div>

                    {!loadingPages ? (
                      <BookPendingPhotos
                        photos={visiblePending}
                        busy={busyPhotos}
                        onGenerate={generateSheet}
                        onMakePortrait={makePortraitSheet}
                        generateHint={generateHint}
                        portraitHint={portraitHint}
                      />
                    ) : null}

                    {loadingPages ? (
                      <p className="flex items-center gap-2 text-sm text-v2-muted">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Loading pages…
                      </p>
                    ) : plan.photoCount > 0 ? (
                      <>
                      <BookPageFitPicker
                        value={pageFit}
                        onChange={setPageFit}
                        sample={plan.contentPages[0]}
                        binding={binding}
                      />
                      <BookPrintQualityNotice pageNumbers={softPrintPages} fit={pageFit} />
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
                        onRemovePage={removePage}
                        onInsertBlank={() => insertBlank("plain")}
                        onInsertLined={() => insertBlank("lined")}
                        onMakePortrait={cloud ? makePortraitSheet : undefined}
                        busy={busyPhotos}
                        portraitHint={portraitHint}
                      />
                      </>
                    ) : selectedProjectIds.length > 0 && visiblePending.length === 0 ? (
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
                    ) : !formatFits && contentCount > 0 && !loadingPages ? (
                      // Pages removed here can leave the format they picked mostly blank.
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        That leaves {plan.paddingCount} blank pages in your {binding.shortLabel.toLowerCase()}.
                        Add some pages back, or{" "}
                        <button
                          type="button"
                          className="font-semibold underline underline-offset-2"
                          onClick={() => openStep("book")}
                        >
                          choose a format that fits
                        </button>
                        .
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

                {step === "cover" && !isDigital ? (
                  <section className="space-y-4" aria-label="Design cover">
                    <div>
                      <h2 className="text-base font-semibold text-v2-ink">Design your cover</h2>
                      <p className="mt-0.5 text-sm text-v2-muted">
                        The cover prints in full color. What you see here is what goes to the printer.
                      </p>
                    </div>
                    <BookCoverDesigner
                      design={coverDesign}
                      onChange={updateCover}
                      binding={binding}
                      pictures={coverPictures}
                      picturesLoading={coverPicturesLoading}
                      canUseOriginals={hasOriginalPhotos(plan.allPages)}
                    />
                  </section>
                ) : null}

                {step === "proof" && !isDigital ? (
                  <section className="space-y-4" aria-label="Check your book">
                    <div>
                      <h2 className="text-base font-semibold text-v2-ink">Check your book, cover to cover</h2>
                      <p className="mt-0.5 text-sm text-v2-muted">
                        This is your proof. Turn every page and make sure it&apos;s what you expect —
                        go back a step to change anything.
                      </p>
                    </div>
                    <BookPrintQualityNotice pageNumbers={softPrintPages} fit={pageFit} />
                    <BookProofStep
                      pages={plan.allPages}
                      binding={binding}
                      design={coverDesign}
                      coverSources={coverSources}
                      confirmed={proofConfirmed}
                      onConfirmedChange={(ok) => setConfirmedProofKey(ok ? proofKey : null)}
                    />
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
                          <h2 className="text-base font-semibold text-v2-ink">
                            {shipDifferent ? "Billing address" : "Your address"}
                          </h2>
                          <p className="mt-0.5 text-xs text-v2-muted">
                            {shipDifferent
                              ? "The address for your account and receipt."
                              : "Your billing address, and where the printer mails your book."}
                          </p>
                          <BookShippingAddressForm
                            className="mt-4"
                            value={address}
                            onChange={updateAddress}
                            errors={addressErrors}
                            section={shipDifferent ? "billing" : "shipping"}
                            hideContact={shipDifferent}
                          />
                          <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-v2-navy">
                            <input
                              type="checkbox"
                              checked={rememberAddress}
                              onChange={(e) => setRememberAddress(e.target.checked)}
                            />
                            Save this address for future orders
                          </label>
                          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-v2-navy">
                            <input
                              type="checkbox"
                              checked={shipDifferent}
                              onChange={(e) => {
                                setShipDifferent(e.target.checked);
                                setAddressErrors({});
                                setShipToErrors({});
                              }}
                            />
                            Ship to a different address
                          </label>
                          {shipDifferent ? (
                            <>
                              <h2 className="mt-6 text-base font-semibold text-v2-ink">Ship to</h2>
                              <p className="mt-0.5 text-xs text-v2-muted">
                                Where the printer should mail your book.
                              </p>
                              <BookShippingAddressForm
                                className="mt-4"
                                idPrefix="ship-to"
                                value={shipTo}
                                onChange={updateShipTo}
                                errors={shipToErrors}
                              />
                            </>
                          ) : null}
                        </>
                      ) : null}

                      <h2 className={cn("text-base font-semibold text-v2-ink", !isDigital && "mt-6")}>Price</h2>
                      {!isDigital && !addressComplete ? (
                        <p className="mt-1 text-xs text-v2-muted">
                          Shipping and tax are estimated until the shipping address is complete.
                        </p>
                      ) : null}
                      <dl className="mt-4 space-y-1.5 text-sm">
                        {isDigital ? (
                          <Money label="Print-at-home PDF" cents={quoteCents} loading={false} />
                        ) : (
                          <>
                            <Money label="Printing" cents={printCents} loading={quoteLoading} />
                            <Money label="Shipping" cents={shippingCents} loading={quoteLoading} />
                            <Money label="Sales tax" cents={taxCents} loading={quoteLoading} />
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
                            onClick={() => openAddCredit(shortfallCents)}
                          >
                            Add {formatCredits(shortfallCents)} credit
                          </button>
                        </div>
                      ) : null}
                      {!isDigital && holidayLine ? (
                        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-v2-navy">
                          <Gift className="h-3.5 w-3.5 shrink-0 text-v2-primary" aria-hidden />
                          {holidayLine}
                        </p>
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
            busy={placing || ((step === "book" || step === "pages") && loadingPages)}
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
          returnPath={`/studio/order?${new URLSearchParams(
            cartId
              ? { cart: cartId, ...(step === "review" ? { step: "review" } : {}) }
              : {
                  ...(selectedProjectIds[0] ? { project: selectedProjectIds[0] } : {}),
                  step: "review",
                  binding: bindingId,
                },
          ).toString()}`}
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
        printCents={printCents}
        shippingCents={shippingCents}
        taxCents={taxCents}
        totalCents={quoteCents}
        shippingZip={shippingZip}
        shippingAddress={shippingAddress}
        onCancel={() => !placing && setConfirmOpen(false)}
        onConfirm={() => void placeOrder()}
      />
    </V2StudioFrame>
  );
}

function StepHeading({
  number,
  title,
  hint,
  muted,
}: {
  number: number;
  title: string;
  hint: string;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex gap-3 transition-opacity", muted && "opacity-60")}>
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-v2-primary text-xs font-bold tabular-nums text-white"
        aria-hidden
      >
        {number}
      </span>
      <div>
        <h2 className="text-base font-semibold text-v2-ink">{title}</h2>
        <p className="mt-0.5 text-sm text-v2-muted">{hint}</p>
      </div>
    </div>
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
