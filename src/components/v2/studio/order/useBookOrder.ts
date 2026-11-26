"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BindingQuote, FormatPrice } from "@/components/v2/book-order/BookBindingPicker";
import { coverSourcesFor, useCoverPictures } from "@/components/v2/book-order/useCoverSources";
import { useSoftPrintPages } from "@/components/v2/book-order/useSoftPrintPages";
import { applySuggestion } from "@/components/v2/book-order/BookAddressSuggestion";
import { useCreditCheckoutReturn } from "@/components/v2/credits/useCreditCheckoutReturn";
import {
  ADDRESS_STORAGE_KEY,
  OWN_ADDRESS_ERRORS,
  SHIP_TO_ADDRESS_ERROR,
  SHIP_TO_STORAGE_KEY,
  cartPages,
  isBlankAddress,
  readStoredAddress,
  readStoredCover,
  storeAddress,
  storeCover,
  storeFormat,
} from "@/components/v2/studio/order/bookOrderStorage";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { putToSignedUrl } from "@/lib/library/client";
import { centsToValue, trackFormat } from "@/lib/marketing/events";
import { BOOK_CARTS_CHANGED_EVENT, type BookCartInput, type BookCartState } from "@/lib/orders/cartTypes";
import { normalizeGiftNote, printableGiftNoteChars } from "@/lib/orders/giftNote";
import {
  isShippingAddressComplete,
  normalizeShippingAddress,
  validateBillingAddress,
  validateShippingAddress,
  type ShippingAddressErrors,
} from "@/lib/orders/shippingAddress";
import type { AddressSuggestion, DigitalBookPage, ShippingAddress } from "@/lib/orders/types";
import {
  BLANK_BACKS_DEFAULT,
  BOOK_BINDINGS,
  PRINT_BINDING_IDS,
  getBookFormat,
  withBlankBacks,
  isDigitalFormat,
  isPrintBindingId,
  type BookBindingId,
  type BookFormatId,
} from "@/lib/print/bookBindings";
import { defaultCoverDesign, normalizeCoverDesign, type BookCoverDesign } from "@/lib/print/bookCover";
import { clearCoverPictureCache, renderFrontCoverJpeg } from "@/lib/print/coverCanvas";
import { printRotationForBookPage } from "@/lib/print/bookPageImageFit";
import {
  bestFitFormat,
  bookFormatFit,
  computeBookPagePlan,
  explainBookPagePadding,
} from "@/lib/print/bookPagePlan";
import type { BookWizardBlankPage, BookWizardNotePage, BookWizardPage, BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import type { PageFit } from "@/lib/print/pageLayout";
import { DEFAULT_SHIPPING_LEVEL, isShippingLevel, type ShippingChoice, type ShippingLevel } from "@/lib/orders/shippingLevels";
import { readStoredQuoteShippingZip } from "@/lib/print/quoteShippingZip";
import { unitPriceCents } from "@/lib/credits/pricing";
import type { AlbumPurchaseCode } from "@/lib/purchaseCodes/types";
import { usePriceList } from "@/lib/pricing/usePriceList";
import { track, trackBookStarted, trackPurchaseOnce } from "@/lib/track";

/** Extra fields the studio keeps with a saved cart. The server stores `state` as it is. */
type StudioCartState = BookCartState & {
  /** The book the customer last confirmed in the proof, so a trip to add credit doesn't ask again. */
  proofKey?: string | null;
  /** The total they agreed to; a different total on return means asking again. */
  quotedCents?: number | null;
  /** True once the customer picked Framed or Edge to edge themselves (older carts always say "framed"). */
  pageFitChosen?: boolean;
  /** The shipping speed picked in the Ship to step; absent until they pick one. */
  shippingLevel?: string;
  /** Filler pages the customer turned into lined pages, or chose to keep blank. */
  blankChoices?: Record<string, "plain" | "lined">;
  /** Which parts of the cover the customer chose (older carts with a cover count as both). */
  coverChoices?: CoverChoices;
  /** Each page printed on its own sheet with a blank back. Carts saved before the choice existed printed both sides. */
  blankBacks?: boolean;
  /** The blank backs are ruled for writing. Absent on carts from before the choice existed. */
  linedBacks?: boolean;
};

/** Parts of the cover the customer picked themselves. */
type CoverChoices = { title: boolean; layout: boolean };

export type PlacedOrder = {
  orderId: string;
  digital: boolean;
  totalCents: number | null;
  email: string | null;
  title: string;
};

/** Book page id for a gallery photo: the same `album:photo` id the saved cart and cover use. */
export function bookPageId(projectId: string, photoId: string): string {
  return `${projectId}:${photoId}`;
}

/** Each page's look in the proof, so a page that changed since it was checked can be shown alone. */
export function proofPageKey(page: BookWizardPage): string {
  return page.kind === "photo"
    ? JSON.stringify([page.id, page.revisionId ?? page.imageDataUrl.slice(-64), page.rotation, page.mirrored === true, page.fit])
    : page.kind === "blank"
      ? JSON.stringify([page.id, page.variant ?? "plain"])
      : JSON.stringify(["note", page.text]);
}

/**
 * Everything about the book being ordered: format, cover, gift, address, price, the saved cart
 * and placing the order. The pages come from the gallery in gallery order; this hook never
 * reorders them. Moved out of the old book wizard; the order calls and money flow are unchanged.
 */
export function useBookOrder({
  pages: galleryPages,
  pagesStillDrawing,
  projectId,
  projectTitle,
  cartParam,
  onRestoreProject,
  purchaseCode = null,
}: {
  /** Pages in the book, in gallery order. */
  pages: BookWizardPhotoPage[];
  /** Photos in the album still being drawn; the purchase waits for them. */
  pagesStillDrawing: number;
  projectId: string | null;
  /** The album name: the cover title until the customer changes it. */
  projectTitle: string;
  /** `?cart=` on arrival: a saved book to pick back up. */
  cartParam: string | null;
  /** A saved book from another album asks the studio to open that album. */
  onRestoreProject?: (projectId: string) => void;
  /** The album's purchase code: it pays for its included book, the customer for anything more. */
  purchaseCode?: AlbumPurchaseCode | null;
}) {
  const router = useRouter();
  const { user, loading: authLoading, refreshUser } = useAuth();
  // Quotes ask what the album's code covers only when the album has one.
  const codeAlbumId = purchaseCode ? projectId : null;
  const prices = usePriceList();
  const digitalCents = useMemo(() => unitPriceCents(prices, "book.digital"), [prices]);
  const signedIn = Boolean(user);

  // ---- picture fit -----------------------------------------------------------
  // One choice for the whole book, like the old wizard: nothing is picked for the customer. Until
  // they pick, pages are laid out framed (nothing cut off).
  const [chosenPageFit, setChosenPageFit] = useState<PageFit | null>(null);
  const pageFit: PageFit = chosenPageFit ?? "framed";
  const photoPages = useMemo(
    () => galleryPages.map((page) => (page.fit === pageFit ? page : { ...page, fit: pageFit })),
    [galleryPages, pageFit],
  );

  // ---- format ----------------------------------------------------------------
  // Nothing is picked for the customer: no format until they choose one (a saved book restores theirs).
  const [chosenBindingId, setChosenBindingId] = useState<BookFormatId | null>(null);
  // Blank backs are on until the customer turns them off to save money. They halve how many
  // pages each binding holds, so every limit below is read through them.
  const [blankBacks, setBlankBacks] = useState(BLANK_BACKS_DEFAULT);
  // The backs can be ruled for journaling or notes instead of left empty; same sheets, same price.
  const [linedBacks, setLinedBacks] = useState(false);
  const contentCount = photoPages.length;
  const recommendedFormat = bestFitFormat(contentCount, blankBacks);
  const bindingId: BookFormatId = chosenBindingId ?? recommendedFormat;
  const isDigital = isDigitalFormat(bindingId);
  /** The format's limits in pages the customer arranges (see `withBlankBacks`). */
  const binding = getBookFormat(bindingId, blankBacks);
  /** Each format's limits as the customer counts pages, with the blank-backs choice applied. */
  const formatSpec = (id: BookFormatId) => getBookFormat(id, blankBacks);

  function chooseFormat(id: BookFormatId) {
    setChosenBindingId(id);
  }

  // ---- gift and addresses --------------------------------------------------------
  const [shippingZip] = useState(() => readStoredQuoteShippingZip());
  const [address, setAddress] = useState<ShippingAddress>(() => readStoredAddress(ADDRESS_STORAGE_KEY));
  const [addressErrors, setAddressErrors] = useState<ShippingAddressErrors>({});
  // Gift and ship-elsewhere start unticked: the customer says so themselves. A saved cart restores them.
  const [shipDifferent, setShipDifferent] = useState(false);
  const [shipTo, setShipTo] = useState<ShippingAddress>(() => readStoredAddress(SHIP_TO_STORAGE_KEY));
  const [isGift, setIsGift] = useState(false);
  const [giftNote, setGiftNoteRaw] = useState("");
  const [rememberAddress, setRememberAddress] = useState(false);
  const hadSavedAddressRef = useRef(false);
  const savedAddressLoadedRef = useRef(false);
  const [hasSavedAddress, setHasSavedAddress] = useState(false);
  const [shipToErrors, setShipToErrors] = useState<ShippingAddressErrors>({});
  const shippingAddress = shipDifferent ? shipTo : address;
  const addressComplete = isShippingAddressComplete(shippingAddress);
  const validateOwnAddress = shipDifferent ? validateBillingAddress : validateShippingAddress;
  const [error, setError] = useState<string | null>(null);

  function setGiftNote(text: string) {
    setGiftNoteRaw(printableGiftNoteChars(text));
  }

  function setGift(next: boolean) {
    setIsGift(next);
    // A gift goes to someone else, so it gets its own ship-to address.
    if (next && !shipDifferent) {
      setShipDifferent(true);
      setAddressErrors({});
      setShipToErrors({});
    }
  }

  function setShipElsewhere(next: boolean) {
    setShipDifferent(next);
    setAddressErrors({});
    setShipToErrors({});
  }

  function clearAddressError(messages: readonly string[]) {
    setError((current) => (current != null && messages.includes(current) ? null : current));
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

  // Prefill from the address saved to the account, unless this tab already has one typed in.
  useEffect(() => {
    if (!user || savedAddressLoadedRef.current) return;
    savedAddressLoadedRef.current = true;
    void api.fetchSavedAddress().then((result) => {
      if (api.isError(result) || !result.data) return;
      const saved = result.data;
      hadSavedAddressRef.current = true;
      setHasSavedAddress(true);
      setRememberAddress(true);
      setAddress((current) => (isBlankAddress(current) ? saved : current));
    });
  }, [user]);

  function persistRememberedAddress() {
    if (rememberAddress) {
      hadSavedAddressRef.current = true;
      void api.saveAddress(normalizeShippingAddress(address));
    } else if (hadSavedAddressRef.current) {
      hadSavedAddressRef.current = false;
      void api.clearSavedAddress();
    }
  }

  /** Checks the addresses; returns the first problem, or null when they're ready to ship to. */
  function validateAddresses(): string | null {
    if (isDigital) return null;
    const errors = validateOwnAddress(address);
    const shipErrors = shipDifferent ? validateShippingAddress(shipTo) : {};
    setAddressErrors(errors);
    setShipToErrors(shipErrors);
    if (Object.keys(errors).length > 0) return shipDifferent ? OWN_ADDRESS_ERRORS[1] : OWN_ADDRESS_ERRORS[0];
    if (Object.keys(shipErrors).length > 0) return SHIP_TO_ADDRESS_ERROR;
    return null;
  }

  const ownAddressReady = Object.keys(validateOwnAddress(address)).length === 0;
  const shipToReady = !shipDifferent || Object.keys(validateShippingAddress(shipTo)).length === 0;
  const addressesReady = isDigital || (ownAddressReady && shipToReady);

  // ---- pages plan --------------------------------------------------------------
  const giftNoteText = !isDigital && isGift ? normalizeGiftNote(giftNote) : "";
  const giftNoteFits = contentCount + 1 <= binding.maxPages;
  const giftNotePage = useMemo<BookWizardNotePage | null>(
    () => (giftNoteText && giftNoteFits ? { id: "gift-note", kind: "note", text: giftNoteText } : null),
    [giftNoteText, giftNoteFits],
  );
  const plannedPages = useMemo<BookWizardPage[]>(
    () => (giftNotePage ? [giftNotePage, ...photoPages] : photoPages),
    [giftNotePage, photoPages],
  );
  // Filler pages the book needs are blank unless the customer makes one a lined (writing) page.
  const [blankChoices, setBlankChoices] = useState<Record<string, "plain" | "lined">>({});
  const plan = useMemo(() => {
    const base = computeBookPagePlan(plannedPages, binding);
    const ruleBacks = linedBacks && binding.blankBacks === true;
    if (Object.keys(blankChoices).length === 0 && !ruleBacks) return base;
    const allPages = base.allPages.map((page) =>
      page.kind !== "blank"
        ? page
        : page.back
          ? ruleBacks
            ? { ...page, variant: "lined" as const }
            : page
          : blankChoices[page.id]
            ? { ...page, variant: blankChoices[page.id] }
            : page,
    );
    return { ...base, allPages, blankPages: allPages.filter((p): p is BookWizardBlankPage => p.kind === "blank") };
  }, [plannedPages, binding, blankChoices, linedBacks]);
  function chooseBlank(id: string, variant: "plain" | "lined") {
    setBlankChoices((prev) => ({ ...prev, [id]: variant }));
  }
  const softPrintPages = useSoftPrintPages(plan.allPages, binding);
  const overCapacity = contentCount > binding.maxPages;
  const formatFits = bookFormatFit(contentCount, binding).fits;
  const paddingNote = explainBookPagePadding(contentCount + (giftNotePage ? 1 : 0), binding, {
    totalPages: plan.totalPages,
    blankCount: plan.paddingCount,
  });

  // ---- cover ---------------------------------------------------------------------
  const [coverDraft, setCoverDraft] = useState<BookCoverDesign | null>(() => readStoredCover());
  const coverDesign = useMemo(() => coverDraft ?? defaultCoverDesign(projectTitle), [coverDraft, projectTitle]);
  // The cover's title and picture are the customer's to choose; the preview only suggests the
  // album name until then. A cover kept from the trip to add credit was already chosen.
  const [coverChoices, setCoverChoices] = useState<CoverChoices>(() =>
    readStoredCover() ? { title: true, layout: true } : { title: false, layout: false },
  );
  const coverReady = coverChoices.title && coverChoices.layout && Boolean(coverDesign.text?.trim());
  const { pictures: coverPictures, loading: coverPicturesLoading } = useCoverPictures(plan.allPages, coverDesign.imageSource);
  const coverSources = useMemo(() => coverSourcesFor(coverDesign, coverPictures), [coverDesign, coverPictures]);
  useEffect(() => clearCoverPictureCache, []);

  /** The customer changed the cover: whatever they touched counts as chosen. */
  function chooseCover(next: BookCoverDesign, chose: Partial<CoverChoices>) {
    setCoverChoices((prev) => ({ title: prev.title || Boolean(chose.title), layout: prev.layout || Boolean(chose.layout) }));
    updateCover(next);
  }

  function updateCover(next: BookCoverDesign) {
    setCoverDraft(next);
    storeCover(next);
  }

  // ---- proof ----------------------------------------------------------------------
  const proofKey = useMemo(
    () => JSON.stringify([bindingId, coverDesign, plan.allPages.map(proofPageKey)]),
    [bindingId, coverDesign, plan.allPages],
  );
  const [confirmedProofKey, setConfirmedProofKey] = useState<string | null>(null);
  /** Pages (and the cover) as they looked when last checked: only changed ones are shown again. */
  const [checkedPageKeys, setCheckedPageKeys] = useState<ReadonlySet<string>>(() => new Set());
  const proofConfirmed = confirmedProofKey === proofKey;
  const coverKey = useMemo(() => JSON.stringify(["cover", bindingId, coverDesign]), [bindingId, coverDesign]);

  function confirmProof() {
    setConfirmedProofKey(proofKey);
    setCheckedPageKeys(new Set([coverKey, ...plan.allPages.map(proofPageKey)]));
  }

  // ---- quotes ---------------------------------------------------------------------
  const [printQuote, setPrintQuote] = useState<BindingQuote | null>(null);
  // Standard (MAIL) unless the customer upgrades; the faster speeds come back with each quote.
  // No speed is picked for the customer. Until they pick, quotes are asked at Standard only to
  // list the speeds and their prices; a single available speed needs no choice.
  const [chosenShippingLevel, setChosenShippingLevel] = useState<ShippingLevel | null>(null);
  const shippingLevel: ShippingLevel = chosenShippingLevel ?? DEFAULT_SHIPPING_LEVEL;
  const [shippingChoices, setShippingChoices] = useState<ShippingChoice[]>([]);
  const [addressSuggestion, setAddressSuggestion] = useState<{ key: string; suggestion: AddressSuggestion } | null>(null);
  const [answeredSuggestions, setAnsweredSuggestions] = useState<string[]>([]);
  // No quote until the customer has picked a format themselves: nothing is chosen for them.
  const quoteActive = signedIn && chosenBindingId != null && !isDigital && plan.totalPages >= 1 && !overCapacity;
  const quotePageCount = plan.totalPages;
  const suggestionKey = [
    shippingAddress.street1,
    shippingAddress.street2,
    shippingAddress.city,
    shippingAddress.state_code,
    shippingAddress.postcode,
    shippingAddress.country_code,
  ]
    .map((v) => (v ?? "").trim().toLowerCase())
    .join("|");
  const visibleSuggestion =
    !isDigital && addressSuggestion?.key === suggestionKey && !answeredSuggestions.includes(suggestionKey)
      ? addressSuggestion.suggestion
      : null;

  useEffect(() => {
    if (!user || !quoteActive || isDigitalFormat(bindingId)) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      const zip = (addressComplete ? shippingAddress.postcode : shippingZip).trim();
      const shipping = addressComplete
        ? {
            shippingAddress: {
              street1: shippingAddress.street1,
              street2: shippingAddress.street2,
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
      void api.fetchOrderQuote({ bindingId, pageCount: quotePageCount, shippingLevel, withShipping: true, projectId: codeAlbumId, ...shipping }).then((result) => {
        if (cancelled) return;
        const choices = api.isError(result) ? [] : (result.data.shippingChoices ?? []);
        setShippingChoices(choices);
        // A speed this address can't get (after the address changed) falls back to Standard.
        // A speed this address can't get (after the address changed) has to be picked again.
        if (choices.length > 0 && !choices.some((c) => c.level === shippingLevel)) setChosenShippingLevel(null);
        const suggestion = api.isError(result) ? null : (result.data.addressSuggestion ?? null);
        setAddressSuggestion(suggestion && addressComplete ? { key: suggestionKey, suggestion } : null);
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
                deliveryMin: result.data.estimatedDeliveryMin ?? null,
                deliveryMax: result.data.estimatedDeliveryMax ?? null,
                coveredCents: result.data.coveredCents ?? null,
              },
        );
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [user, quoteActive, bindingId, quotePageCount, shippingLevel, shippingZip, addressComplete, suggestionKey, codeAlbumId, shippingAddress.street1, shippingAddress.street2, shippingAddress.city, shippingAddress.state_code, shippingAddress.postcode, shippingAddress.country_code]);

  function answerSuggestion(use: boolean) {
    if (!visibleSuggestion) return;
    const answered = suggestionKey;
    if (use) {
      const next = applySuggestion(shippingAddress, visibleSuggestion);
      if (shipDifferent) updateShipTo(next);
      else updateAddress(next);
    }
    setAnsweredSuggestions((prev) => [...prev, answered]);
  }

  /** Printed size of the book in each format: the chosen pages, padded as that binding needs. */
  const formatPlans = useMemo(() => {
    const plans = {} as Record<BookBindingId, { totalPages: number; frontCount: number }>;
    for (const id of PRINT_BINDING_IDS) {
      const { totalPages, frontCount } = computeBookPagePlan(photoPages, withBlankBacks(BOOK_BINDINGS[id], blankBacks));
      plans[id] = { totalPages, frontCount };
    }
    return plans;
  }, [photoPages, blankBacks]);
  const formatPageCounts = useMemo(() => {
    const counts = {} as Record<BookBindingId, number>;
    for (const id of PRINT_BINDING_IDS) counts[id] = formatPlans[id].totalPages;
    return counts;
  }, [formatPlans]);

  /**
   * The chosen binding printed the other way (blank backs off when they're on, and the reverse),
   * so the choice can say what it costs. Null when the pages wouldn't fit that way.
   */
  const otherBacksPageCount = useMemo(() => {
    if (!isPrintBindingId(bindingId)) return null;
    const other = getBookFormat(bindingId, !blankBacks);
    if (!bookFormatFit(contentCount, other).fits) return null;
    return computeBookPagePlan(plannedPages, other).totalPages;
  }, [bindingId, blankBacks, contentCount, plannedPages]);

  const [formatQuotes, setFormatQuotes] = useState<Record<string, number | null>>({});
  const formatQuotesAsked = useRef(new Set<string>());

  useEffect(() => {
    // Quotes need an account; a guest sees the example price instead.
    if (!user || contentCount === 0) return;
    const t = window.setTimeout(() => {
      const wanted: [BookBindingId, number][] = PRINT_BINDING_IDS.filter((id) =>
        bookFormatFit(contentCount, withBlankBacks(BOOK_BINDINGS[id], blankBacks)).fits,
      ).map((id) => [id, formatPageCounts[id]]);
      if (isPrintBindingId(bindingId) && otherBacksPageCount != null) {
        wanted.push([bindingId, plan.totalPages], [bindingId, otherBacksPageCount]);
      }
      for (const [id, pageCount] of wanted) {
        const key = `${id}:${pageCount}`;
        if (formatQuotesAsked.current.has(key)) continue;
        formatQuotesAsked.current.add(key);
        void api.fetchOrderQuote({ bindingId: id, pageCount }).then((result) => {
          // Before tax: the quote address is only a placeholder here, so its tax would mislead.
          const book = api.isError(result) ? null : result.data.printCents;
          setFormatQuotes((prev) => ({ ...prev, [key]: book ?? null }));
        });
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [user, contentCount, formatPageCounts, blankBacks, bindingId, plan.totalPages, otherBacksPageCount]);

  /** What blank backs add to the book's price (before shipping and tax), once both prices are in. */
  const blankBacksExtraCents = useMemo(() => {
    if (!isPrintBindingId(bindingId) || otherBacksPageCount == null) return null;
    const current = formatQuotes[`${bindingId}:${plan.totalPages}`];
    const other = formatQuotes[`${bindingId}:${otherBacksPageCount}`];
    if (current == null || other == null) return null;
    return blankBacks ? current - other : other - current;
  }, [bindingId, otherBacksPageCount, formatQuotes, plan.totalPages, blankBacks]);

  const formatPrices = useMemo(() => {
    const out: Partial<Record<BookBindingId, FormatPrice>> = {};
    for (const id of PRINT_BINDING_IDS) {
      const pageCount = formatPageCounts[id];
      const key = `${id}:${pageCount}`;
      out[id] = {
        pageCount,
        frontCount: formatPlans[id].frontCount,
        bookCents: formatQuotes[key] ?? null,
        loading: signedIn && !(key in formatQuotes),
        overCapacity: pageCount > BOOK_BINDINGS[id].maxPages,
      };
    }
    return out;
  }, [formatPageCounts, formatPlans, formatQuotes, signedIn]);

  const selectedQuote: BindingQuote | null = chosenBindingId == null
    ? null
    : isDigital
    ? { totalCents: digitalCents, printCents: null, shippingCents: null, taxCents: null, loading: digitalCents == null, error: null }
    : printQuote;
  const quoteCents = selectedQuote?.totalCents ?? null;
  const quoteLoading = selectedQuote?.loading ?? false;
  // The album's code pays for its included book (printed books only); the customer pays the rest.
  const coveredCents =
    purchaseCode && !isDigital && quoteCents != null ? Math.min(printQuote?.coveredCents ?? 0, quoteCents) : 0;
  /** What the customer pays: the total less what the code covers. */
  const dueCents = quoteCents != null ? Math.max(0, quoteCents - coveredCents) : null;
  const balanceCents = user?.creditsBalanceCents ?? null;
  const shortfallCents = balanceCents != null && dueCents != null ? Math.max(0, dueCents - balanceCents) : 0;

  // ---- saved cart --------------------------------------------------------------------
  // A book is saved to the cart only once the customer has started it on purpose ("Start my
  // book") and made a real choice (the format). Each album keeps at most one saved book: opening
  // an album picks its book back up instead of starting another one.
  const [started, setStarted] = useState(false);
  const [cartId, setCartId] = useState<string | null>(cartParam);
  const cartIdRef = useRef<string | null>(cartParam);
  /** The album the current cart belongs to, once known (state for rendering, ref for saves). */
  const [cartAlbum, setCartAlbumState] = useState<string | null>(null);
  const cartAlbumRef = useRef<string | null>(null);
  function setCartAlbum(album: string | null) {
    cartAlbumRef.current = album;
    setCartAlbumState(album);
  }
  const cartClosedRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  /** The draft order placing created, reused if placing is tried again. */
  const savedDraftIdRef = useRef<string | null>(null);
  /**
   * The order confirmed for payment when paying it then failed. It can't be edited any more, so trying
   * again pays it as it is when the book hasn't changed (`key`), and starts a new draft when it has.
   */
  const awaitingRef = useRef<{ orderId: string; key: string } | null>(null);
  const [restoredCart, setRestoredCart] = useState<StudioCartState | null>(null);

  // This album's saved book, if it has one (a `?cart=` link names it instead).
  const [albumLookup, setAlbumLookup] = useState<{ projectId: string; cartId: string | null } | null>(null);
  useEffect(() => {
    if (!user || !projectId || cartParam) return;
    let cancelled = false;
    void api.listBookCarts().then((result) => {
      if (cancelled) return;
      const found = api.isError(result) ? null : (result.data.find((c) => c.projectId === projectId) ?? null);
      setAlbumLookup({ projectId, cartId: found?.id ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [user, projectId, cartParam]);
  const lookupDone = Boolean(cartParam) || albumLookup?.projectId === projectId;
  const restoreId = cartParam ?? (albumLookup?.projectId === projectId ? albumLookup.cartId : null);

  /** The cart id whose saved book has been read back (or failed to), so restoring is done. */
  const [restoredCartId, setRestoredCartId] = useState<string | null>(null);
  const restoring = Boolean(restoreId) && (authLoading || (Boolean(user) && restoredCartId !== restoreId));

  const projectIdRef = useRef(projectId);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);
  const onRestoreProjectRef = useRef(onRestoreProject);
  useEffect(() => {
    onRestoreProjectRef.current = onRestoreProject;
  }, [onRestoreProject]);

  // Moving to another album leaves this album's book behind (still saved) and starts clean.
  useEffect(() => {
    if (!cartAlbumRef.current || cartAlbumRef.current === projectId) return;
    cartIdRef.current = null;
    cartClosedRef.current = false;
    savedDraftIdRef.current = null;
    awaitingRef.current = null;
    storeCover(null);
    // One reset when the album changes.
    setCartAlbum(null);
    setCartId(null);
    setStarted(false);
    setRestoredCart(null);
    setConfirmedProofKey(null);
    setCheckedPageKeys(new Set());
    setCoverChoices({ title: false, layout: false });
    setChosenShippingLevel(null);
    setCoverDraft(null);
    setGiftNoteRaw("");
    setBlankBacks(BLANK_BACKS_DEFAULT);
    setLinedBacks(false);
  }, [projectId]);

  // Read a saved book back from the cart.
  const restoredForRef = useRef<string | null>(null);
  useEffect(() => {
    // A saved cart needs an account; it is picked up after sign-in.
    if (!restoreId || authLoading || !user) return;
    if (restoredForRef.current === restoreId) return;
    restoredForRef.current = restoreId;
    const fromLink = restoreId === cartParam;
    let cancelled = false;
    void api.fetchBookCart(restoreId).then((result) => {
      if (cancelled) return;
      if (api.isError(result)) {
        cartIdRef.current = null;
        setCartId(null);
        if (fromLink) {
          setError(
            result.error.code === "NOT_FOUND"
              ? "That book isn't in your cart anymore. You can start it again here."
              : "We couldn't open your saved book. Please try again.",
          );
        }
        setRestoredCartId(restoreId);
        return;
      }
      const saved = result.data.state as StudioCartState;
      cartIdRef.current = restoreId;
      cartClosedRef.current = false;
      setCartId(restoreId);
      const format = saved.bindingId === "digital" || isPrintBindingId(saved.bindingId) ? saved.bindingId : null;
      if (format && saved.bindingTouched) chooseFormat(format);
      if (saved.coverDesign) setCoverDraft(normalizeCoverDesign(saved.coverDesign));
      setShipDifferent(saved.shipDifferent === true);
      setIsGift(saved.isGift === true);
      if (saved.pageFitChosen) setChosenPageFit(saved.pageFit === "full" ? "full" : "framed");
      if (isShippingLevel(saved.shippingLevel)) setChosenShippingLevel(saved.shippingLevel);
      setCoverChoices(
        saved.coverChoices ?? (saved.coverDesign ? { title: true, layout: true } : { title: false, layout: false }),
      );
      if (saved.blankChoices && typeof saved.blankChoices === "object") setBlankChoices(saved.blankChoices);
      // A cart from before the choice existed was laid out printing both sides; keep it that way.
      setBlankBacks(typeof saved.blankBacks === "boolean" ? saved.blankBacks : false);
      setLinedBacks(saved.linedBacks === true);
      if (typeof saved.giftNote === "string") setGiftNoteRaw(printableGiftNoteChars(saved.giftNote));
      const album = Array.isArray(saved.selectedProjectIds) ? saved.selectedProjectIds[0] : null;
      setCartAlbum(album ?? projectIdRef.current);
      // Read now, not when the fetch began: the studio may have opened an album in the meantime.
      if (album && album !== projectIdRef.current) onRestoreProjectRef.current?.(album);
      if (saved.proofKey) setConfirmedProofKey(saved.proofKey);
      setRestoredCart(saved);
      setStarted(true);
      setRestoredCartId(restoreId);
    });
    return () => {
      cancelled = true;
    };
    // chooseFormat is read once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreId, authLoading, user]);

  const cartInput = useMemo<BookCartInput>(() => {
    const firstPhoto = plan.allPages.find((p): p is BookWizardPhotoPage => p.kind === "photo");
    const state: StudioCartState = {
      v: 1,
      step: "review",
      visited: ["book", "pages", "cover", "review"],
      selectedProjectIds: projectId ? [projectId] : [],
      bindingId,
      bindingTouched: chosenBindingId != null,
      pageFit,
      pageFitChosen: chosenPageFit != null,
      ...(chosenShippingLevel ? { shippingLevel: chosenShippingLevel } : {}),
      blankChoices,
      blankBacks,
      linedBacks,
      coverChoices,
      pages: cartPages(photoPages),
      removedIds: [],
      coverDesign: coverDraft,
      shipDifferent,
      isGift,
      giftNote,
      proofKey: confirmedProofKey,
      quotedCents: quoteCents,
    };
    return {
      title: coverDesign.text?.trim() || projectTitle,
      step: "review",
      bindingId,
      // The pages the customer sees; with blank backs the printer counts twice as many.
      pageCount: plan.frontCount,
      photoCount: plan.photoCount,
      thumbRevisionId: firstPhoto?.revisionId ?? null,
      state,
    };
  }, [plan, projectId, bindingId, chosenBindingId, photoPages, pageFit, chosenPageFit, chosenShippingLevel, blankChoices, blankBacks, linedBacks, coverChoices, coverDraft, shipDifferent, isGift, giftNote, confirmedProofKey, quoteCents, coverDesign.text, projectTitle]);

  // Saved as it changes once it is in the cart; before that, only after "Start my book" and a format.
  const cartReady =
    signedIn &&
    lookupDone &&
    !restoring &&
    contentCount > 0 &&
    (cartId != null || (started && chosenBindingId != null)) &&
    (cartAlbum == null || cartAlbum === projectId);

  function saveCart(input: BookCartInput): Promise<void> {
    // One save at a time, so a new book is only ever created once.
    const album = projectId;
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (cartClosedRef.current) return;
      // The album changed while this save waited: it belongs to a book that was left behind.
      if (projectIdRef.current !== album) return;
      const id = cartIdRef.current;
      if (id) {
        const updated = await api.updateBookCart(id, input);
        if (api.isError(updated) && updated.error.code === "NOT_FOUND") {
          cartClosedRef.current = true;
          cartIdRef.current = null;
          setCartId(null);
        }
      } else {
        const created = await api.createBookCart(input);
        if (api.isError(created)) return;
        cartIdRef.current = created.data.id;
        setCartAlbum(album);
        setCartId(created.data.id);
      }
      window.dispatchEvent(new Event(BOOK_CARTS_CHANGED_EVENT));
    });
    return saveChainRef.current;
  }

  useEffect(() => {
    if (!cartReady) return;
    const t = window.setTimeout(() => void saveCart(cartInput), 700);
    return () => window.clearTimeout(t);
  }, [cartReady, cartInput]);

  async function closeCart() {
    await saveChainRef.current;
    cartClosedRef.current = true;
    const id = cartIdRef.current;
    if (!id) return;
    await api.deleteBookCart(id);
    window.dispatchEvent(new Event(BOOK_CARTS_CHANGED_EVENT));
  }

  /** "Start my book": the customer chose to make a book from this album. */
  const bookStartedRef = useRef(false);
  function begin() {
    setStarted(true);
    if (bookStartedRef.current || !user || cartIdRef.current) return;
    bookStartedRef.current = true;
    trackBookStarted(trackFormat(bindingId));
  }

  /** Throws this album's book away: the saved cart goes and the next start is a fresh one. */
  async function discard() {
    await closeCart();
    cartIdRef.current = null;
    setCartAlbum(null);
    cartClosedRef.current = false;
    savedDraftIdRef.current = null;
    awaitingRef.current = null;
    setCartId(null);
    setStarted(false);
    setRestoredCart(null);
    setConfirmedProofKey(null);
    setCheckedPageKeys(new Set());
    setCoverChoices({ title: false, layout: false });
    setChosenShippingLevel(null);
    setCoverDraft(null);
    storeCover(null);
    setChosenBindingId(null);
    storeFormat(null);
    setChosenPageFit(null);
    setBlankChoices({});
    setBlankBacks(BLANK_BACKS_DEFAULT);
    setLinedBacks(false);
    setGiftNoteRaw("");
    setIsGift(false);
    setError(null);
  }

  // ---- adding credit ----------------------------------------------------------------
  const [addCredit, setAddCredit] = useState<{ cents: number; returnPath: string } | null>(null);
  const [topUpTick, setTopUpTick] = useState(0);
  useCreditCheckoutReturn({
    creditedHint: "You can finish your order.",
    onBalanceChanged: () => setTopUpTick((n) => n + 1),
  });

  /** Saves the book (with its proof) and opens add-credit; Stripe comes back to finish the purchase. */
  async function startTopUp(cents: number) {
    let id = cartIdRef.current;
    if (signedIn && contentCount > 0) {
      await saveCart(cartInput);
      id = cartIdRef.current;
    }
    const returnPath = id
      ? `/studio?${new URLSearchParams({ checkout: "resume", cart: id }).toString()}`
      : "/studio?checkout=resume";
    setAddCredit({ cents, returnPath });
  }

  // ---- placing the order --------------------------------------------------------------
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const coverTitle = coverDesign.text?.trim() || projectTitle;

  function pageManifest(): DigitalBookPage[] | null {
    const pages: DigitalBookPage[] = [];
    for (const page of plan.allPages) {
      if (page.kind === "blank") {
        pages.push(
          page.back
            ? { kind: "blank", variant: page.variant === "lined" ? "lined" : "plain", back: true }
            : { kind: "blank", variant: page.variant === "lined" ? "lined" : "plain" },
        );
        continue;
      }
      if (page.kind === "note") {
        pages.push({ kind: "note", text: page.text });
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

  function contactEmail(): string | null {
    const typed = (shipDifferent ? address.email : shippingAddress.email)?.trim();
    return typed || user?.email || null;
  }

  async function placeDigitalOrder(): Promise<boolean> {
    const pages = pageManifest();
    if (!pages) {
      setError("One of your pages isn't saved to your library yet. Open it and try again.");
      setPlacing(false);
      return false;
    }
    const created = await api.createDigitalBookOrder({ projectTitle: coverTitle, pages });
    if (api.isError(created)) {
      setError(created.error.message);
      setPlacing(false);
      if (created.error.code === "INSUFFICIENT_CREDITS") void refreshUser();
      return false;
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
    setPlacing(false);
    setPlaced({ orderId, digital: true, totalCents: quoteCents, email: user?.email ?? null, title: coverTitle });
    return true;
  }

  /** Places the order and pays it from the wallet. True when it went through. */
  async function placeOrder(): Promise<boolean> {
    if (placing) return false;
    setError(null);
    if (quoteCents != null) {
      track("checkout_started", {
        value: centsToValue(quoteCents),
        currency: "USD",
        page_count: plan.totalPages,
        format: trackFormat(bindingId),
        is_gift: !isDigital && isGift,
      });
    }
    setPlacing(true);
    if (isDigital) return placeDigitalOrder();

    persistRememberedAddress();
    const pages = pageManifest();
    if (!pages) {
      setError("One of your pages isn't saved to your library yet. Open it and try again.");
      setPlacing(false);
      return false;
    }
    const book = {
      shippingPostcode: shippingZip.trim() || null,
      shippingAddress: normalizeShippingAddress(shippingAddress),
      billingAddress: shipDifferent ? normalizeShippingAddress(address) : null,
      pages,
      coverDesign,
      proofConfirmed,
      isGift,
      shippingLevel,
      projectId,
    };
    const placeKey = JSON.stringify({ bindingId, pageCount: plan.totalPages, coverTitle, book, code: purchaseCode?.codeId ?? null });
    if (awaitingRef.current && awaitingRef.current.key !== placeKey) {
      // The book changed since the last try: the confirmed order can't take the change, so start a new one.
      awaitingRef.current = null;
      savedDraftIdRef.current = null;
    }
    let orderId = awaitingRef.current?.orderId ?? savedDraftIdRef.current;
    if (!awaitingRef.current) {
      if (orderId) {
        const updated = await api.updateDraftBookOrder(orderId, {
          bindingId,
          pageCount: plan.totalPages,
          projectTitle: coverTitle,
          ...book,
        });
        if (api.isError(updated)) {
          setError(updated.error.message);
          setPlacing(false);
          return false;
        }
      } else {
        const created = await api.createDraftBookOrder({
          bindingId,
          pageCount: plan.totalPages,
          photoCount: plan.photoCount,
          blankCount: plan.blankCount,
          projectTitle: coverTitle,
          ...book,
        });
        if (api.isError(created)) {
          setError(created.error.message);
          setPlacing(false);
          return false;
        }
        orderId = created.data.orderId;
        savedDraftIdRef.current = orderId;
      }

      // The front cover goes up as a print-size image, drawn by the same code as the preview.
      const upload = await api.createOrderCoverUpload(orderId);
      if (api.isError(upload)) {
        setError(upload.error.message);
        setPlacing(false);
        return false;
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
        return false;
      }
      const uploaded = await putToSignedUrl(upload.data, coverImage, "image/jpeg");
      if (api.isError(uploaded)) {
        setError("We couldn't save your cover. Please try again.");
        setPlacing(false);
        return false;
      }

      const confirmed = await api.confirmDraftBookOrder(orderId);
      if (api.isError(confirmed)) {
        setPlacing(false);
        setError(confirmed.error.message);
        return false;
      }
      awaitingRef.current = { orderId, key: placeKey };
    }
    if (!orderId) {
      setPlacing(false);
      return false;
    }
    storeCover(null);
    storeFormat(null);

    // Pay from the wallet right away; the server then sends the book to the printer.
    const paid = await api.placeBookOrder(orderId);
    if (api.isError(paid)) {
      setPlacing(false);
      const code = paid.error.code;
      if (code === "INSUFFICIENT_CREDITS" || code === "INVALID_STATE") {
        // Short of credit (the price went up), or no longer waiting for payment (already paid, say):
        // the order page shows where it stands and its checkout panel takes it from here.
        void refreshUser();
        await closeCart();
        router.push(code === "INSUFFICIENT_CREDITS" ? `/orders/${orderId}?confirmed=1` : `/orders/${orderId}`);
        return false;
      }
      // Anything else: stay on the review with the reason, the book still in the cart.
      console.error(`[order] place ${orderId} failed: ${paid.error.message}`);
      if (code === "PURCHASE_CODE_INVALID") {
        // The code's cover is worked out when an order is confirmed: the next try confirms a fresh one.
        awaitingRef.current = null;
        savedDraftIdRef.current = null;
      }
      setError(
        code === "PURCHASE_CODE_INVALID"
          ? paid.error.message
          : "We couldn't take payment for your book just now. Your book is saved; please try again in a moment.",
      );
      return false;
    }
    trackPurchaseOnce({
      value: centsToValue(paid.data.creditsAppliedCents || quoteCents || 0),
      currency: "USD",
      order_id: orderId,
      format: trackFormat(bindingId),
      is_gift: isGift,
    });
    await refreshUser();
    await closeCart();
    setPlacing(false);
    setPlaced({
      orderId,
      digital: false,
      totalCents: paid.data.creditsAppliedCents || quoteCents,
      email: contactEmail(),
      title: coverTitle,
    });
    return true;
  }

  // An album with a purchase code starts on the binding the code includes; the customer can still
  // pick another (the difference is shown as extra).
  const codeFormatAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!purchaseCode || restoring || chosenBindingId != null) return;
    if (codeFormatAppliedRef.current === purchaseCode.codeId) return;
    codeFormatAppliedRef.current = purchaseCode.codeId;
    setChosenBindingId(purchaseCode.bundle.bindingId);
  }, [purchaseCode, restoring, chosenBindingId]);

  // A package whose shipping was paid up front at a faster speed starts on that speed, which the
  // order shows as included.
  const codeShippingAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!purchaseCode || restoring || chosenShippingLevel != null) return;
    if (purchaseCode.shippingPrepaidCents <= 0 || !isShippingLevel(purchaseCode.bundle.shippingLevel)) return;
    if (purchaseCode.bundle.shippingLevel === DEFAULT_SHIPPING_LEVEL) return;
    if (codeShippingAppliedRef.current === purchaseCode.codeId) return;
    codeShippingAppliedRef.current = purchaseCode.codeId;
    setChosenShippingLevel(purchaseCode.bundle.shippingLevel);
  }, [purchaseCode, restoring, chosenShippingLevel]);

  /** After the thanks screen: a fresh book can be started from the same album. */
  function startOver() {
    setPlaced(null);
    savedDraftIdRef.current = null;
    awaitingRef.current = null;
    cartIdRef.current = null;
    cartClosedRef.current = false;
    setCartId(null);
    setConfirmedProofKey(null);
    setCheckedPageKeys(new Set());
    setCoverChoices({ title: false, layout: false });
    setChosenShippingLevel(null);
    setStarted(false);
    setGiftNoteRaw("");
    setCoverDraft(null);
  }

  return {
    signedIn,
    restoring,
    restoredCart,
    error,
    setError,
    /** True once the customer chose to make a book here (or picked a saved one back up). */
    started,
    begin,
    discard,
    // format
    bindingId,
    /** The chosen format's limits in pages the customer arranges, blank backs applied. */
    binding,
    formatSpec,
    isDigital,
    chosenBindingId,
    /** False until the customer picks a format; there is no default. */
    formatChosen: chosenBindingId != null,
    recommendedFormat,
    chooseFormat,
    formatPrices,
    digitalCents,
    /** The printer's estimated delivery window for a printed book; null for the PDF or before a quote. */
    deliveryEstimate:
      !isDigital && printQuote && (printQuote.deliveryMin || printQuote.deliveryMax)
        ? { min: printQuote.deliveryMin ?? null, max: printQuote.deliveryMax ?? null }
        : null,
    // picture fit
    pageFit,
    pageFitChosen: chosenPageFit != null,
    // filler pages
    blankChoices,
    chooseBlank,
    // blank backs
    /** Each page prints alone on its own sheet (printed books only). */
    blankBacks: blankBacks && !isDigital,
    /** The customer's choice, kept while the PDF is picked so a printed format gets it back. */
    blankBacksChoice: blankBacks,
    chooseBlankBacks: setBlankBacks,
    /** The blank backs are ruled for journaling or notes. */
    linedBacks,
    chooseLinedBacks: setLinedBacks,
    blankBacksExtraCents,
    /** The pages also fit the chosen binding printed the other way. */
    otherBacksFits: otherBacksPageCount != null,
    // shipping speed
    shippingLevel,
    shippingChoices,
    chooseShippingLevel: setChosenShippingLevel,
    /** A speed is settled: picked by the customer, or the only one there is. */
    shippingChosen:
      chosenShippingLevel != null ||
      // An album with a code starts on the standard shipping the code includes.
      (purchaseCode != null && !isDigital && (purchaseCode.shippingIncluded || purchaseCode.shippingPrepaidCents > 0)) ||
      (shippingChoices.length <= 1 && printQuote != null && !printQuote.loading && printQuote.totalCents != null),
    choosePageFit: setChosenPageFit,
    formatFits,
    overCapacity,
    // pages
    contentCount,
    pagesStillDrawing,
    plan,
    paddingNote,
    softPrintPages,
    giftNotePage,
    giftNoteFits,
    // cover
    coverDesign,
    coverTitle,
    coverPictures,
    coverPicturesLoading,
    coverSources,
    updateCover,
    chooseCover,
    coverChoices,
    /** The customer chose both the cover's title and its picture. */
    coverReady,
    // address and gift
    address,
    updateAddress,
    addressErrors,
    shipTo,
    updateShipTo,
    shipToErrors,
    shipDifferent,
    setShipElsewhere,
    isGift,
    setGift,
    giftNote,
    setGiftNote,
    rememberAddress,
    setRememberAddress,
    hasSavedAddress,
    shippingAddress,
    addressComplete,
    addressesReady,
    validateAddresses,
    visibleSuggestion,
    answerSuggestion,
    // price
    quoteCents,
    /** Part of the total the album's purchase code pays (0 without one). */
    coveredCents,
    /** What the customer pays from their wallet: the total less what the code covers. */
    dueCents,
    purchaseCode: isDigital ? null : purchaseCode,
    /** The album's code even while the PDF (which it doesn't pay for) is picked. */
    albumPurchaseCode: purchaseCode,
    quoteLoading,
    quoteError: selectedQuote?.error ?? null,
    printCents: selectedQuote?.printCents ?? null,
    shippingCents: selectedQuote?.shippingCents ?? null,
    taxCents: selectedQuote?.taxCents ?? null,
    balanceCents,
    shortfallCents,
    // proof
    proofKey,
    proofConfirmed,
    confirmProof,
    checkedPageKeys,
    coverKey,
    // cart and money
    cartId,
    addCredit,
    closeAddCredit: () => setAddCredit(null),
    startTopUp,
    topUpTick,
    placing,
    placed,
    placeOrder,
    startOver,
  };
}

export type BookOrder = ReturnType<typeof useBookOrder>;
