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
  readStoredFormat,
  storeAddress,
  storeCover,
  storeFormat,
} from "@/components/v2/studio/order/bookOrderStorage";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { putToSignedUrl } from "@/lib/library/client";
import { centsToValue, trackFormat } from "@/lib/marketing/events";
import { readIntent } from "@/lib/marketing/copy";
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
import { printRotationForBookPage } from "@/lib/print/bookPageImageFit";
import {
  bestFitFormat,
  bookFormatFit,
  computeBookPagePlan,
  explainBookPagePadding,
} from "@/lib/print/bookPagePlan";
import type { BookWizardNotePage, BookWizardPage, BookWizardPhotoPage } from "@/lib/print/bookWizardTypes";
import { readStoredQuoteShippingZip } from "@/lib/print/quoteShippingZip";
import { unitPriceCents } from "@/lib/credits/pricing";
import { usePriceList } from "@/lib/pricing/usePriceList";
import { track, trackBookStarted, trackPurchaseOnce } from "@/lib/track";

/** Extra fields the studio keeps with a saved cart. The server stores `state` as it is. */
type StudioCartState = BookCartState & {
  /** The book the customer last confirmed in the proof, so a trip to add credit doesn't ask again. */
  proofKey?: string | null;
  /** The total they agreed to; a different total on return means asking again. */
  quotedCents?: number | null;
};

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
  pages: photoPages,
  pagesStillDrawing,
  projectId,
  projectTitle,
  cartParam,
  onRestoreProject,
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
}) {
  const router = useRouter();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const prices = usePriceList();
  const digitalCents = useMemo(() => unitPriceCents(prices, "book.digital"), [prices]);
  const signedIn = Boolean(user);

  // ---- format ----------------------------------------------------------------
  const [storedFormat] = useState(() => readStoredFormat());
  const [chosenBindingId, setChosenBindingId] = useState<BookFormatId | null>(storedFormat);
  const contentCount = photoPages.length;
  const recommendedFormat = bestFitFormat(contentCount);
  const bindingId: BookFormatId = chosenBindingId ?? recommendedFormat;
  const isDigital = isDigitalFormat(bindingId);
  const binding = getBookFormat(bindingId);

  function chooseFormat(id: BookFormatId) {
    setChosenBindingId(id);
    storeFormat(id);
  }

  // ---- gift and addresses --------------------------------------------------------
  const [shippingZip] = useState(() => readStoredQuoteShippingZip());
  const [address, setAddress] = useState<ShippingAddress>(() => readStoredAddress(ADDRESS_STORAGE_KEY));
  const [addressErrors, setAddressErrors] = useState<ShippingAddressErrors>({});
  // A gift visitor starts with the gift box ticked and the ship-to form open. A saved cart wins.
  const [startsAsGift] = useState(() => readIntent() === "gift");
  const [shipDifferent, setShipDifferent] = useState(startsAsGift);
  const [shipTo, setShipTo] = useState<ShippingAddress>(() => readStoredAddress(SHIP_TO_STORAGE_KEY));
  const [isGift, setIsGift] = useState(startsAsGift);
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
  const plan = useMemo(() => computeBookPagePlan(plannedPages, binding), [plannedPages, binding]);
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
  const { pictures: coverPictures, loading: coverPicturesLoading } = useCoverPictures(plan.allPages, coverDesign.imageSource);
  const coverSources = useMemo(() => coverSourcesFor(coverDesign, coverPictures), [coverDesign, coverPictures]);
  useEffect(() => clearCoverPictureCache, []);

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
  const [addressSuggestion, setAddressSuggestion] = useState<{ key: string; suggestion: AddressSuggestion } | null>(null);
  const [answeredSuggestions, setAnsweredSuggestions] = useState<string[]>([]);
  const quoteActive = signedIn && !isDigital && plan.totalPages >= 1 && !overCapacity;
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
      void api.fetchOrderQuote({ bindingId, pageCount: quotePageCount, ...shipping }).then((result) => {
        if (cancelled) return;
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
              },
        );
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [user, quoteActive, bindingId, quotePageCount, shippingZip, addressComplete, suggestionKey, shippingAddress.street1, shippingAddress.street2, shippingAddress.city, shippingAddress.state_code, shippingAddress.postcode, shippingAddress.country_code]);

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
  const formatPageCounts = useMemo(() => {
    const counts = {} as Record<BookBindingId, number>;
    for (const id of PRINT_BINDING_IDS) counts[id] = computeBookPagePlan(photoPages, BOOK_BINDINGS[id]).totalPages;
    return counts;
  }, [photoPages]);
  const [formatQuotes, setFormatQuotes] = useState<Record<string, number | null>>({});
  const formatQuotesAsked = useRef(new Set<string>());

  useEffect(() => {
    // Quotes need an account; a guest sees the example price instead.
    if (!user || contentCount === 0) return;
    const t = window.setTimeout(() => {
      for (const id of PRINT_BINDING_IDS) {
        const pageCount = formatPageCounts[id];
        const key = `${id}:${pageCount}`;
        if (!bookFormatFit(contentCount, BOOK_BINDINGS[id]).fits || formatQuotesAsked.current.has(key)) continue;
        formatQuotesAsked.current.add(key);
        void api.fetchOrderQuote({ bindingId: id, pageCount }).then((result) => {
          // Before tax: the quote address is only a placeholder here, so its tax would mislead.
          const book = api.isError(result) ? null : result.data.printCents;
          setFormatQuotes((prev) => ({ ...prev, [key]: book ?? null }));
        });
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [user, contentCount, formatPageCounts]);

  const formatPrices = useMemo(() => {
    const out: Partial<Record<BookBindingId, FormatPrice>> = {};
    for (const id of PRINT_BINDING_IDS) {
      const pageCount = formatPageCounts[id];
      const key = `${id}:${pageCount}`;
      out[id] = {
        pageCount,
        bookCents: formatQuotes[key] ?? null,
        loading: signedIn && !(key in formatQuotes),
        overCapacity: pageCount > BOOK_BINDINGS[id].maxPages,
      };
    }
    return out;
  }, [formatPageCounts, formatQuotes, signedIn]);

  const selectedQuote: BindingQuote | null = isDigital
    ? { totalCents: digitalCents, printCents: null, shippingCents: null, taxCents: null, loading: digitalCents == null, error: null }
    : printQuote;
  const quoteCents = selectedQuote?.totalCents ?? null;
  const quoteLoading = selectedQuote?.loading ?? false;
  const balanceCents = user?.creditsBalanceCents ?? null;
  const shortfallCents = balanceCents != null && quoteCents != null ? Math.max(0, quoteCents - balanceCents) : 0;

  // ---- analytics ---------------------------------------------------------------------
  /** The cart id whose saved book has been read back (or failed to), so restoring is done. */
  const [restoredCartId, setRestoredCartId] = useState<string | null>(null);
  const restoring = Boolean(cartParam) && (authLoading || (Boolean(user) && restoredCartId !== cartParam));
  const bookStartedRef = useRef(false);
  useEffect(() => {
    if (bookStartedRef.current || !user || restoring || contentCount === 0) return;
    bookStartedRef.current = true;
    trackBookStarted(trackFormat(bindingId));
  }, [user, bindingId, restoring, contentCount]);

  // ---- saved cart --------------------------------------------------------------------
  const [cartId, setCartId] = useState<string | null>(cartParam);
  const cartIdRef = useRef<string | null>(cartParam);
  const cartClosedRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  /** The customer has done something with the book: from then on it is saved as it changes. */
  const [touched, setTouched] = useState(false);
  const [restoredCart, setRestoredCart] = useState<StudioCartState | null>(null);

  // Read a saved book back from the cart.
  const restoredForRef = useRef<string | null>(null);
  useEffect(() => {
    // A saved cart needs an account; it is picked up after sign-in.
    if (!cartParam || authLoading || !user) return;
    if (restoredForRef.current === cartParam) return;
    restoredForRef.current = cartParam;
    let cancelled = false;
    void api.fetchBookCart(cartParam).then((result) => {
      if (cancelled) return;
      if (api.isError(result)) {
        cartIdRef.current = null;
        setCartId(null);
        setError(
          result.error.code === "NOT_FOUND"
            ? "That book isn't in your cart anymore. You can start it again here."
            : "We couldn't open your saved book. Please try again.",
        );
        setRestoredCartId(cartParam);
        return;
      }
      const saved = result.data.state as StudioCartState;
      cartIdRef.current = cartParam;
      setCartId(cartParam);
      const format = saved.bindingId === "digital" || isPrintBindingId(saved.bindingId) ? saved.bindingId : null;
      if (format && saved.bindingTouched) chooseFormat(format);
      if (saved.coverDesign) setCoverDraft(normalizeCoverDesign(saved.coverDesign));
      setShipDifferent(saved.shipDifferent === true);
      setIsGift(saved.isGift === true);
      if (typeof saved.giftNote === "string") setGiftNoteRaw(printableGiftNoteChars(saved.giftNote));
      const album = Array.isArray(saved.selectedProjectIds) ? saved.selectedProjectIds[0] : null;
      if (album && album !== projectId) onRestoreProject?.(album);
      if (saved.proofKey) setConfirmedProofKey(saved.proofKey);
      setRestoredCart(saved);
      setTouched(true);
      setRestoredCartId(cartParam);
    });
    return () => {
      cancelled = true;
    };
    // chooseFormat, onRestoreProject and projectId are read once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartParam, authLoading, user]);

  const cartInput = useMemo<BookCartInput>(() => {
    const firstPhoto = plan.allPages.find((p): p is BookWizardPhotoPage => p.kind === "photo");
    const state: StudioCartState = {
      v: 1,
      step: "review",
      visited: ["book", "pages", "cover", "review"],
      selectedProjectIds: projectId ? [projectId] : [],
      bindingId,
      bindingTouched: chosenBindingId != null,
      pageFit: "framed",
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
      pageCount: plan.totalPages,
      photoCount: plan.photoCount,
      thumbRevisionId: firstPhoto?.revisionId ?? null,
      state,
    };
  }, [plan, projectId, bindingId, chosenBindingId, photoPages, coverDraft, shipDifferent, isGift, giftNote, confirmedProofKey, quoteCents, coverDesign.text, projectTitle]);

  const cartReady = signedIn && !restoring && touched && contentCount > 0;

  function saveCart(input: BookCartInput): Promise<void> {
    // One save at a time, so a new book is only ever created once.
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (cartClosedRef.current) return;
      const id = cartIdRef.current;
      if (id) {
        const updated = await api.updateBookCart(id, input);
        if (api.isError(updated) && updated.error.code === "NOT_FOUND") cartClosedRef.current = true;
      } else {
        const created = await api.createBookCart(input);
        if (api.isError(created)) return;
        cartIdRef.current = created.data.id;
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
  const savedDraftIdRef = useRef<string | null>(null);
  const coverTitle = coverDesign.text?.trim() || projectTitle;

  function pageManifest(): DigitalBookPage[] | null {
    const pages: DigitalBookPage[] = [];
    for (const page of plan.allPages) {
      if (page.kind === "blank") {
        pages.push({ kind: "blank", variant: page.variant === "lined" ? "lined" : "plain" });
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
    };
    let orderId = savedDraftIdRef.current;
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
    storeCover(null);
    storeFormat(null);

    // Pay from the wallet right away; the server then sends the book to the printer.
    const paid = await api.placeBookOrder(orderId);
    if (api.isError(paid)) {
      setPlacing(false);
      // The book is saved and waiting for payment; the order page's checkout panel takes it from here.
      if (paid.error.code === "INSUFFICIENT_CREDITS") void refreshUser();
      else console.error(`[order] place ${orderId} failed: ${paid.error.message}`);
      await closeCart();
      router.push(`/orders/${orderId}?confirmed=1`);
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

  /** After the thanks screen: a fresh book can be started from the same album. */
  function startOver() {
    setPlaced(null);
    savedDraftIdRef.current = null;
    cartIdRef.current = null;
    cartClosedRef.current = false;
    setCartId(null);
    setConfirmedProofKey(null);
    setCheckedPageKeys(new Set());
    setTouched(false);
    setGiftNoteRaw("");
    setCoverDraft(null);
  }

  return {
    signedIn,
    restoring,
    restoredCart,
    error,
    setError,
    touch: () => setTouched(true),
    // format
    bindingId,
    binding,
    isDigital,
    chosenBindingId,
    recommendedFormat,
    chooseFormat,
    formatPrices,
    digitalCents,
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
