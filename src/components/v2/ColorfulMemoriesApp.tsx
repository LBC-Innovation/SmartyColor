"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Check, Download, FolderInput, Loader2, Minus, Pencil, Trash2 } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { cn } from "@/lib/cn";
import { V2GuestLimitModal } from "@/components/v2/auth/V2GuestLimitModal";
import { V2LibraryMigrationBanner } from "@/components/v2/V2LibraryMigrationBanner";
import { PagePrintShareModal } from "@/components/v2/studio/PagePrintShareModal";
import { V2SheetEditChat } from "@/components/v2/V2SheetEditChat";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import { V2AddCreditModal } from "@/components/v2/credits/V2AddCreditModal";
import { useSheetUsageCredits } from "@/components/v2/credits/useSheetUsageCredits";
import { useV2LibraryDeletion } from "@/components/v2/library/useV2LibraryDeletion";
import { useV2PhotoIngest } from "@/components/v2/library/useV2PhotoIngest";
import { V2SavePromptCard } from "@/components/v2/marketing/V2SavePromptCard";
import { useV2WelcomeGuide } from "@/components/v2/onboarding/V2WelcomeGuide";
import { PageEditorModal, type EditorView } from "@/components/v2/studio/PageEditorModal";
import { currentShape, shapePlan } from "@/components/v2/studio/pageShape";
import { UploadProgressBar } from "@/components/v2/studio/UploadProgressBar";
import { useUploadProgress } from "@/components/v2/studio/useUploadProgress";
import { useOnDemandPdf } from "@/components/v2/usePrintablePdf";
import { StudioGallery } from "@/components/v2/studio/StudioGallery";
import { AddPhotosModal } from "@/components/v2/studio/AddPhotosModal";
import { DownloadSelectedDialog } from "@/components/v2/studio/DownloadSelectedDialog";
import { MoveSelectedDialog } from "@/components/v2/studio/MoveSelectedDialog";
import { StudioEmptyAlbum } from "@/components/v2/studio/StudioEmptyAlbum";
import { KeepAlbumPrompt } from "@/components/v2/studio/KeepAlbumPrompt";
import { StudioHeader } from "@/components/v2/studio/StudioHeader";
import { UploadStrip } from "@/components/v2/studio/UploadStrip";
import { PLACEHOLDER_ALBUM_NAME, isAutomaticAlbumName } from "@/components/v2/studio/albumNames";
import { GallerySkeletonCard, type CardState } from "@/components/v2/studio/GalleryCard";
import { usePhotoLocks } from "@/components/v2/studio/usePhotoLocks";
import { useSheetGeneration, type GenerateOptions } from "@/components/v2/studio/useSheetGeneration";
import { useSheetQueue, type BatchSummary } from "@/components/v2/studio/useSheetQueue";
import { BookOrderCard, DockedBookPresence } from "@/components/v2/studio/order/BookOrderCard";
import { BookOrderPanel, ConfirmButton, bookSteps, confirmBlocker, formatSummary, type OrderRow } from "@/components/v2/studio/order/BookOrderPanel";
import { BookPromoCard, type BookProgress } from "@/components/v2/studio/order/BookPromoCard";
import { BottomSheet } from "@/components/v2/studio/order/BottomSheet";
import { ConfirmPurchaseModal, type ConfirmStep } from "@/components/v2/studio/order/ConfirmPurchaseModal";
import { activePageVersion, galleryBook, pagePrintPrefs, pageSourceVersion } from "@/components/v2/studio/order/galleryBookPages";
import { useBookOrder } from "@/components/v2/studio/order/useBookOrder";
import { INTENT_ALBUM_NAME, STUDIO_EMPTY } from "@/content/marketing";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/api/client";
import { copyPhotoToAlbum } from "@/lib/library/client";
import { projectMetaFromLibrary } from "@/lib/v2/cloudLibrary";
import type { GuestLimitScope } from "@/lib/guestLimit";
import { formatCredits } from "@/lib/credits/money";
import { freeEditsPerSheet, sheetUsageCostCents } from "@/lib/credits/pricing";
import { readIntent } from "@/lib/marketing/copy";
import type { QuickFixKind } from "@/lib/photo/sheetQuickFixes";
import { usePriceList } from "@/lib/pricing/usePriceList";
import { codeCoversAction, newPagesCovered } from "@/lib/purchaseCodes/types";
import { AlbumCodeBanner } from "@/components/v2/redeem/AlbumCodeBanner";
import { PackageMeter } from "@/components/v2/book-packages/PackageMeter";
import { ThemeModal } from "@/components/v2/book-packages/ThemeModal";
import { CancelPackageModal } from "@/components/v2/book-packages/CancelPackageModal";
import { PACKAGE_CHANGED_EVENT, notifyPackageChanged } from "@/lib/bookPackages/events";
import { SIGNED_IN_HOME } from "@/components/v2/nav-config";
import { isPackageCode, packagePhotosLeft, touchUpsLeft } from "@/lib/bookPackages/allowance";
import { fillPackageCopy, packageTokens, packageUntouchedNote } from "@/lib/bookPackages/copy";
import { packageEditNotice } from "@/lib/bookPackages/notices";
import { BOOK_PACKAGES } from "@/content/marketing";
import { useAlbumPurchaseCode } from "@/components/v2/redeem/useAlbumPurchaseCode";
import { photoOrientation, type V2PhotoEntry } from "@/lib/v2/studioTypes";

const INTENT_NAMED_KEY = "cm_intent_named";
/** "Make pages as I add", remembered per device: "on", "off", or unset (not chosen yet). */
const AUTOPAGE_KEY = "cm_autopage";
/** "on" turns landscape photos portrait as they are added. Off unless chosen: it uses credit. */
const AUTOPORTRAIT_KEY = "cm_autoportrait";
/** Photos reframed at the same time while adding a batch. */
/** Guests: only the first few photos of a batch are drawn by themselves. */
const GUEST_AUTO_BATCH = 3;
const INTERRUPTED = "This page was interrupted. Tap to try again.";
/** Photos with a page request in flight, so a reload can tell which ones it cut short. */
const INFLIGHT_KEY = "cm_pages_inflight";

function readInflight(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(INFLIGHT_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeInflight(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(INFLIGHT_KEY, JSON.stringify(ids));
    else localStorage.removeItem(INFLIGHT_KEY);
  } catch {
    /* ignore */
  }
}

function readAutoPref(): "on" | "off" | null {
  try {
    const v = localStorage.getItem(AUTOPAGE_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

function readAutoPortrait(): boolean {
  try {
    return localStorage.getItem(AUTOPORTRAIT_KEY) === "on";
  } catch {
    return false;
  }
}

function writeAutoPortrait(on: boolean) {
  try {
    localStorage.setItem(AUTOPORTRAIT_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

function writeAutoPref(v: "on" | "off") {
  try {
    localStorage.setItem(AUTOPAGE_KEY, v);
  } catch {
    /* ignore */
  }
}

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Two layouts: under 1024px the gallery is full width with a book bar; from 1024px a 60/40 split. */
function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/**
 * The studio: one screen from photos to a paid book. A gallery of photos with their coloring pages
 * (the gallery order is the book order), a page editor, and the "Your book" order panel (a sticky
 * column on desktop, a book bar and bottom sheet on phones).
 */
export function ColorfulMemoriesApp() {
  const toast = useV2Toast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const welcomeGuide = useV2WelcomeGuide();
  const prices = usePriceList();
  const { user } = useAuth();
  const desktop = useIsDesktop();
  const {
    hydrated,
    cloud,
    activeProjectId,
    activeProject,
    albumLoading,
    projects,
    renameActiveProject,
    switchProject,
    refreshActiveProject,
    setProjectDesignTheme,
    upsertProject,
    deleteProject,
    photos,
    photosRef,
    pendingUploads,
    replacePhotos,
    mutatePhotos,
  } = useV2Studio();
  const signedIn = Boolean(user) && cloud;

  // A visitor who came from a landing page (gift, birthday, pets) gets their first, empty album
  // named to match, once per visit. Only a placeholder name is replaced, never one they chose.
  useEffect(() => {
    if (!hydrated || !activeProject || projects.length !== 1 || photos.length > 0) return;
    const name = INTENT_ALBUM_NAME[readIntent()];
    if (!name || !PLACEHOLDER_ALBUM_NAME.test(activeProject.name)) return;
    try {
      if (sessionStorage.getItem(INTENT_NAMED_KEY)) return;
      sessionStorage.setItem(INTENT_NAMED_KEY, "1");
    } catch {
      /* rename anyway */
    }
    renameActiveProject(name);
  }, [hydrated, activeProject, projects.length, photos.length, renameActiveProject]);

  // ---- making pages ------------------------------------------------------------------
  const locks = usePhotoLocks();
  // The album's purchase code, if it has one: it pays for its included pages, edits and book first.
  const albumCode = useAlbumPurchaseCode(signedIn ? activeProjectId : null);
  const code = albumCode.code;
  // A book package is a code the customer bought: same allowance, its own wording, shipping not included.
  const pkgCode = isPackageCode(code) ? code : null;
  const pkgTokens = pkgCode
    ? packageTokens({
        bindingId: pkgCode.bundle.bindingId,
        includedPhotos: pkgCode.bundle.includedPages,
        editsPerPhoto: pkgCode.bundle.editsPerPage,
      })
    : null;
  const [themeOpen, setThemeOpen] = useState(false);
  const [cancelPkgOpen, setCancelPkgOpen] = useState(false);
  // A package canceled elsewhere (the album menu): re-read the allowance so the meter goes away.
  const refreshAlbumCode = albumCode.refresh;
  useEffect(() => {
    const onChanged = () => refreshAlbumCode();
    window.addEventListener(PACKAGE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PACKAGE_CHANGED_EVENT, onChanged);
  }, [refreshAlbumCode]);
  // The order panel handles the return from adding credit, so it can finish the purchase.
  const sheetCredits = useSheetUsageCredits("/studio", {
    handleCheckoutReturn: false,
    covers: (kind, photo) => codeCoversAction(code, kind, photo),
    onUsage: albumCode.refresh,
    packageNote: pkgCode
      ? {
          bindingNameLower: String(pkgTokens?.bindingNameLower ?? ""),
          photosLeft: packagePhotosLeft(pkgCode, photos.map((p) => p.id)),
          ordered: Boolean(pkgCode.bookOrderId),
        }
      : null,
  });
  const [guestLimit, setGuestLimit] = useState<{ scope: GuestLimitScope; kind: "page" | "edit" } | null>(null);
  const guestLimitShownRef = useRef(false);
  const showGuestLimit = useCallback((scope: GuestLimitScope, kind: "page" | "edit") => {
    if (kind === "page" && guestLimitShownRef.current) return;
    if (kind === "page") guestLimitShownRef.current = true;
    setGuestLimit({ scope, kind });
  }, []);
  const gen = useSheetGeneration({ sheetCredits, locks, onGuestLimit: showGuestLimit });

  function onBatchEnd(summary: BatchSummary) {
    guestLimitShownRef.current = false;
    const { ready, failed } = summary;
    if (ready + failed === 0) return;
    if (failed === 0) {
      toast.success({
        title: ready === 1 ? "Coloring page ready!" : `${ready} coloring pages ready`,
        message: ready === 1 ? "Tap it to check it, fix it or print it." : "Tap any page to check it, fix it or print it.",
      });
    } else {
      toast.info(
        "Tap Try again on the page to have another go.",
        `${ready} ready, ${failed} ${failed === 1 ? "needs" : "need"} another try`,
      );
    }
  }

  const queue = useSheetQueue({
    run: async (photoId, options) => {
      writeInflight([...new Set([...readInflight(), photoId])]);
      try {
        const outcome = await gen.generateForPhoto(photoId, options);
        if (outcome.kind === "limit") showGuestLimit(outcome.scope, "page");
        return outcome;
      } finally {
        writeInflight(readInflight().filter((id) => id !== photoId));
      }
    },
    onBatchEnd,
  });

  // One polite announcement for the whole batch, not one per page.
  const liveMessage =
    queue.progress.total > 0
      ? `${queue.progress.done} of ${queue.progress.total} ${queue.progress.total === 1 ? "page" : "pages"} ready`
      : "";

  const pagePriceCents = signedIn ? sheetUsageCostCents(prices, "generation") : null;
  const balanceCents = user?.creditsBalanceCents ?? null;

  /** A price beyond the album's purchase code, said as extra so it is never mistaken for included. */
  function extraLabel(cents: number | null): string | null {
    return cents != null ? `${formatCredits(cents)} extra` : null;
  }

  /** "Make the rest": how many the code includes and what the others cost. */
  function restCostLabel(count: number): string {
    if (!signedIn) return "free to try";
    if (pagePriceCents == null) return "uses credit";
    const included = Math.min(count, newPagesCovered(code));
    const paid = count - included;
    if (!code) return formatCredits(pagePriceCents * count);
    if (paid === 0) return pkgCode ? BOOK_PACKAGES.restIncluded : "included with your code";
    return included > 0
      ? `${included} included, ${formatCredits(pagePriceCents * paid)} extra`
      : `${formatCredits(pagePriceCents * paid)} extra`;
  }

  /** How many more pages the album's code and the wallet cover, after what is already running or waiting. */
  function pagesAffordable(): number {
    if (!signedIn || pagePriceCents == null || pagePriceCents <= 0 || balanceCents == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, newPagesCovered(code) + Math.floor(balanceCents / pagePriceCents) - (queue.running + queue.queued));
  }

  const [shortCount, setShortCount] = useState(0);
  const [addCreditFor, setAddCreditFor] = useState<number | null>(null);

  /** Queue pages, never more than the wallet covers (signed in). Returns how many were queued. */
  function makePages(ids: string[], options?: GenerateOptions): number {
    const wanted = ids.filter((id) => {
      const p = photosRef.current.find((e) => e.id === id);
      return p && (options?.addVersion || !activePageVersion(p)) && !p.generating;
    });
    if (wanted.length === 0) return 0;
    const cap = pagesAffordable();
    const take = wanted.slice(0, cap === Number.POSITIVE_INFINITY ? wanted.length : cap);
    setShortCount(wanted.length - take.length);
    if (take.length === 0) {
      setAddCreditFor(pagePriceCents != null && balanceCents != null ? Math.max(0, pagePriceCents - balanceCents) : 0);
      return 0;
    }
    return enqueuePages(take, options);
  }

  /**
   * Queues first pages, with "Make wide photos fill the page" applied: a wide photo's first page is
   * drawn portrait, recomposed as it is drawn. A redraw or a page from a chosen photo version keeps
   * the options it was given.
   */
  function enqueuePages(ids: string[], options?: GenerateOptions): number {
    if (options || !optionsRef.current.autoPortrait) return queue.enqueue(ids, options);
    const wide = ids.filter((id) => {
      const p = photosRef.current.find((e) => e.id === id);
      return p != null && photoOrientation(p) === "landscape" && !activePageVersion(p);
    });
    const rest = ids.filter((id) => !wide.includes(id));
    return queue.enqueue(rest) + queue.enqueue(wide, { orientation: "portrait" });
  }

  // ---- "Make pages as I add" ---------------------------------------------------------
  // Read on the client only: the studio renders nothing that uses it until it has hydrated.
  const [autoPref, setAutoPref] = useState<"on" | "off" | null>(readAutoPref);
  const autoOn = signedIn ? autoPref === "on" : autoPref !== "off";
  const [choiceIds, setChoiceIds] = useState<string[] | null>(null);

  function setAuto(on: boolean) {
    const v = on ? "on" : "off";
    writeAutoPref(v);
    setAutoPref(v);
  }

  // ---- "Make wide photos fill the page" ----------------------------------------------
  // Wide photos get portrait pages, drawn that way in the one page generation (enqueuePages).
  const [autoPortrait, setAutoPortraitState] = useState<boolean>(readAutoPortrait);
  function setAutoPortrait(on: boolean) {
    writeAutoPortrait(on);
    setAutoPortraitState(on);
  }

  /**
   * Photos that landed in a batch still uploading. Pages only start once the whole batch is in, so
   * until then their cards wait like queued ones (no "Make page" to click); `page` marks the ones a
   * page is coming for, which the progress bar counts.
   */
  type Awaiting = { id: string; page: boolean };
  const [awaiting, setAwaitingState] = useState<Awaiting[]>([]);
  const awaitingRef = useRef<Awaiting[]>([]);
  /** Waiting photos taken out with the X on their card; their batch leaves them out. */
  const droppedRef = useRef<Set<string>>(new Set());
  function setAwaiting(next: Awaiting[]) {
    awaitingRef.current = next;
    setAwaitingState(next);
  }
  function dropAwaiting(id: string) {
    if (!awaitingRef.current.some((a) => a.id === id)) return;
    droppedRef.current.add(id);
    setAwaiting(awaitingRef.current.filter((a) => a.id !== id));
  }
  const awaitingIds = awaiting.map((a) => a.id);
  const awaitingPageIds = awaiting.filter((a) => a.page).map((a) => a.id);

  /** What happens to a batch once it's known whether pages are made for it. */
  function startBatch(ids: string[], draw: boolean) {
    const dropped = droppedRef.current;
    // Guests: the first few of each batch are drawn by themselves.
    const keep = (signedIn ? ids : ids.slice(0, GUEST_AUTO_BATCH)).filter((id) => !dropped.has(id));
    setAwaiting(awaitingRef.current.filter((a) => !ids.includes(a.id)));
    for (const id of ids) dropped.delete(id);
    if (!draw) return;
    if (!signedIn) enqueuePages(keep);
    else makePages(keep);
  }

  /** As each photo of a batch lands: hold its card as waiting until the batch is in. */
  function onPhotoLanded(entry: V2PhotoEntry, index: number) {
    const { autoOn, autoPref } = optionsRef.current;
    const page = autoOn && !(signedIn && autoPref == null) && (signedIn || index < GUEST_AUTO_BATCH);
    setAwaiting([...awaitingRef.current, { id: entry.id, page }]);
  }

  // Uploads finish long after they start; the options in force then are what counts, not the ones
  // captured when the upload began.
  const optionsRef = useRef({ autoOn, autoPortrait, autoPref });
  useEffect(() => {
    optionsRef.current = { autoOn, autoPortrait, autoPref };
  });

  function onPhotosAdded(added: V2PhotoEntry[]) {
    const { autoOn, autoPref } = optionsRef.current;
    const ids = added.map((p) => p.id);
    if (!signedIn) {
      // Guests: the first few of each batch are drawn by themselves; each photo at most once.
      startBatch(ids, autoOn);
      return;
    }
    // Never spend credit without a clear choice: the first batch on this device asks.
    if (autoPref == null) {
      setChoiceIds((prev) => [...(prev ?? []), ...ids]);
      return;
    }
    startBatch(ids, autoOn);
  }

  const ingestFiles = useV2PhotoIngest({ onAdded: onPhotosAdded, onEach: onPhotoLanded });
  // Everything that adds photos opens this modal; dropped files arrive already staged.
  const [addPhotos, setAddPhotos] = useState<{ files: File[] } | null>(null);

  function chooseAuto(make: boolean) {
    setAuto(make);
    const ids = choiceIds ?? [];
    setChoiceIds(null);
    startBatch(ids, make);
  }

  // ---- interrupted pages ---------------------------------------------------------------
  // A reload (or iOS dropping the tab) loses a page mid-drawing. Anything still flagged as
  // drawing with no live request becomes "Try again".
  const sweepInterrupted = useCallback(() => {
    const cutShort = new Set(readInflight().filter((id) => !queue.isLive(id)));
    const stale = photosRef.current.filter(
      (p) => ((p.generating || p.correcting) || cutShort.has(p.id)) && !queue.isLive(p.id) && !locks.has(p.id),
    );
    if (cutShort.size) writeInflight(readInflight().filter((id) => !cutShort.has(id)));
    if (stale.length === 0) return;
    const ids = new Set(stale.map((p) => p.id));
    mutatePhotos((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, generating: false, correcting: false } : p)));
    for (const p of stale) if (!activePageVersion(p)) queue.markFailed(p.id, INTERRUPTED);
    if (cloud) void refreshActiveProject();
  }, [photosRef, queue, locks, mutatePhotos, cloud, refreshActiveProject]);

  const sweptRef = useRef(false);
  useEffect(() => {
    if (!hydrated || sweptRef.current) return;
    sweptRef.current = true;
    sweepInterrupted();
  }, [hydrated, sweepInterrupted]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") sweepInterrupted();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sweepInterrupted]);

  // ---- book --------------------------------------------------------------------------
  const book = useMemo(() => galleryBook(photos, activeProjectId, activeProject?.name ?? "Album"), [photos, activeProjectId, activeProject?.name]);
  const cartParam = searchParams.get("cart");
  const order = useBookOrder({
    pages: book.pages,
    pagesStillDrawing: book.stillDrawing + queue.queued,
    projectId: activeProjectId,
    projectTitle: activeProject?.name ?? "My coloring book",
    cartParam,
    purchaseCode: code,
    onRestoreProject: (id) => {
      if (projects.some((p) => p.id === id)) switchProject(id);
    },
  });
  /** Building the book: the order card beside the gallery (desktop) or the sheet (phones). */
  const [bookOpen, setBookOpen] = useState(false);
  /** The book toast was closed; it stays closed until the page reloads. */
  const [bookPromoHidden, setBookPromoHidden] = useState(false);
  const [openRow, setOpenRow] = useState<OrderRow | null>("format");
  const [confirm, setConfirm] = useState<{ step: ConfirmStep; autoPlace: boolean } | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  // Arrivals: "?book=open" (after sign-up), "?step=review" (old links), "?checkout=resume" (back from Stripe).
  const wantsBook = searchParams.get("book") === "open" || searchParams.get("step") === "review";
  const resuming = searchParams.get("checkout") === "resume";
  const arrivalKey =
    hydrated && (wantsBook || resuming) && !(resuming && (order.restoring || !user)) ? searchParams.toString() : null;
  const [handledArrival, setHandledArrival] = useState<string | null>(null);
  if (arrivalKey && arrivalKey !== handledArrival) {
    setHandledArrival(arrivalKey);
    if (wantsBook) order.begin();
    setBookOpen(true);
    if (resuming && order.proofConfirmed) setConfirm({ step: "overview", autoPlace: true });
    else if (resuming || searchParams.get("step") === "review") setOpenRow("ship");
  }
  useEffect(() => {
    if (!handledArrival) return;
    // Leave a clean address so a reload doesn't do this again (the cart id stays for the panel).
    const url = new URL(window.location.href);
    for (const k of ["book", "step", "checkout", "project"]) url.searchParams.delete(k);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [handledArrival]);

  /** "Start my book" / "Continue your book": open the book at the first step that needs them. */
  function openBook() {
    order.begin();
    setOpenRow(bookSteps(order).find((step) => step.state !== "done")?.row ?? null);
    setBookOpen(true);
  }

  function showGallery() {
    if (!desktop) setBookOpen(false);
    // Desktop scrolls the gallery column itself; phones scroll the page.
    if (desktop) galleryRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    else galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openConfirm() {
    const problem = order.validateAddresses();
    if (problem) {
      order.setError(problem);
      setOpenRow("ship");
      return;
    }
    order.setError(null);
    setConfirm({ step: order.proofConfirmed ? "overview" : "proof", autoPlace: false });
  }

  // ---- editor ------------------------------------------------------------------------
  const [editor, setEditor] = useState<{ photoId: string; view: EditorView } | null>(null);
  const [editChatOpen, setEditChatOpen] = useState(false);
  /** The photo whose page is in the "Print or share" dialog (from a card or the editor). */
  const [output, setOutput] = useState<{ id: string; mode: "all" | "send" } | null>(null);
  const outputPhoto = output ? photos.find((p) => p.id === output.id) : null;
  const pdfOnDemand = useOnDemandPdf();
  const [undo, setUndo] = useState<{ photoId: string; revisionId: string } | null>(null);
  const editorIndex = editor ? photos.findIndex((p) => p.id === editor.photoId) : -1;
  const editorPhoto = editorIndex >= 0 ? photos[editorIndex] : null;

  function openEditor(photoId: string, view: EditorView) {
    if (editor?.photoId !== photoId) gen.resetEditChat();
    setUndo(null);
    setEditor({ photoId, view });
  }

  function closeEditor() {
    setEditor(null);
    setEditChatOpen(false);
    setUndo(null);
  }

  function moveEditor(delta: -1 | 1) {
    const next = photos[editorIndex + delta];
    if (next) openEditor(next.id, activePageVersion(next) ? "page" : "photo");
  }

  async function quickFix(kind: QuickFixKind) {
    if (!editorPhoto) return;
    const previous = await gen.applyQuickFixVersion(editorPhoto.id, kind);
    if (previous) setUndo({ photoId: editorPhoto.id, revisionId: previous });
  }

  // ---- deleting and selecting -----------------------------------------------------------
  const deletion = useV2LibraryDeletion({
    // A package's included slot is never freed by deleting its photo: say so before it happens.
    note: (ids) => (pkgCode && ids.some((id) => pkgCode.photos[id]) ? BOOK_PACKAGES.deleteNote : null),
  });
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [bulk, setBulk] = useState<"move" | "download" | null>(null);
  const selectedPhotos = photos.filter((p) => deletion.selectedIds.has(p.id));

  function deletePhoto(id: string) {
    queue.cancel([id]);
    deletion.request([id]);
  }

  // ---- card states ---------------------------------------------------------------------
  function cardState(photo: V2PhotoEntry): CardState {
    const q = queue.status(photo.id);
    if (q === "queued" || (!q && awaitingIds.includes(photo.id))) return "queued";
    if (photo.generating || q === "running") return "drawing";
    if (activePageVersion(photo)) return "ready";
    if (queue.failures[photo.id]) return "failed";
    return "none";
  }
  const giftOffset = order.giftNotePage ? 1 : 0;
  /** Package albums: what each finished page's allowance is, under its card. */
  function pkgCardAllowance(photo: V2PhotoEntry): { text: string; extra: boolean } | null {
    if (!pkgCode || !photo.remote || cardState(photo) !== "ready") return null;
    const left = touchUpsLeft(pkgCode, photo);
    if (left == null) return { text: BOOK_PACKAGES.extraPage, extra: true };
    if (pkgCode.bundle.editsPerPage === 0) return null;
    if (left === 0) return { text: BOOK_PACKAGES.touchUpsUsed, extra: false };
    return {
      text:
        left === 1
          ? BOOK_PACKAGES.oneTouchUpLeft
          : (fillPackageCopy(BOOK_PACKAGES.touchUpsLeft, { touchUpsLeft: left }) ?? BOOK_PACKAGES.touchUpsUsed),
      extra: false,
    };
  }

  const cardInfo = (photo: V2PhotoEntry) => {
    const position = book.positionByPhotoId.get(photo.id);
    return {
      state: cardState(photo),
      // Page numbers only once a book is being built: the gallery is just pages otherwise.
      bookNumber: (bookOpen || order.started) && position != null ? position + giftOffset : null,
      leftOut: photo.printPrefs.book?.leftOut === true,
      failureMessage: queue.failures[photo.id],
      allowance: pkgCardAllowance(photo),
    };
  };

  const withoutPageIds = photos
    .filter((p) => !p.printPrefs.book?.leftOut && cardState(p) === "none")
    .map((p) => p.id);
  // Pages the book panel's checks can include or leave out: finished pages, and ones already left out.
  const bookChoices = photos.filter((p) => p.printPrefs.book?.leftOut === true || cardState(p) === "ready");
  const bookChoicesIn = bookChoices.filter((p) => p.printPrefs.book?.leftOut !== true).length;
  const failedCount = photos.filter((p) => cardState(p) === "failed").length;
  const uploading = pendingUploads.length > 0;
  const activeCount = queue.running + queue.queued;
  const showStrip = choiceIds != null || shortCount > 0;
  const uploadProgress = useUploadProgress({
    pendingUploadIds: pendingUploads.map((u) => u.id),
    livePageIds: [...queue.liveIds, ...awaitingPageIds.filter((id) => !queue.liveIds.includes(id))],
    runningPageIds: queue.liveIds.filter((id) => queue.status(id) === "running"),
    expectPages: autoOn && choiceIds == null,
  });

  // ---- desktop: drop files anywhere on the gallery ----------------------------------------
  const [dropping, setDropping] = useState(false);
  function onDragOver(e: DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    setDropping(true);
  }
  function onDrop(e: DragEvent) {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setDropping(false);
    setAddPhotos({ files: Array.from(e.dataTransfer.files) });
  }

  // ---- printing ----------------------------------------------------------------------
  async function makePagePdf(photo: V2PhotoEntry | null | undefined): Promise<Blob> {
    const version = photo ? activePageVersion(photo) : null;
    if (!photo || !version) throw new Error("Pick a coloring page first.");
    const response = await authedFetch(
      "/api/pdf",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          photo.remote
            ? { revisionId: version.id, printPrefs: pagePrintPrefs(photo) }
            : { imageDataUrl: version.sheet.imageDataUrl, printPrefs: pagePrintPrefs(photo) },
        ),
      },
      { withAuth: Boolean(photo.remote) },
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Could not make a PDF.");
    }
    return response.blob();
  }

  if (!hydrated) {
    return (
      <V2StudioFrame>
        <div className="flex flex-1 items-center justify-center pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <p className="flex items-center gap-2 text-sm text-v2-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading your album…
          </p>
        </div>
      </V2StudioFrame>
    );
  }

  const blocker = confirmBlocker(order);
  const hasBookPage = order.contentCount > 0 || book.stillDrawing > 0;
  const steps = bookSteps(order);
  /** A book under way for this album (saved, or started here): the gallery offers to continue it. */
  const bookProgress: BookProgress | null =
    order.cartId || (order.started && order.formatChosen)
      ? {
          done: steps.filter((step) => step.state === "done").length,
          total: steps.length,
          summary: order.formatChosen ? formatSummary(order) : null,
        }
      : null;
  // Stays open when every page is left out, so the checks on the cards can put one back.
  const bookCardOpen = desktop && bookOpen && (hasBookPage || book.leftOut > 0);
  // Phones: the album toolbar has no room for the book button, so a book bar replaces the tab bar
  // (the header menu has the tabs) once there's a finished page to book, or a book under way.
  const showBookBar = !desktop && !editor && (bookProgress != null ? hasBookPage : order.contentCount > 0);
  // Turning the page to the other shape: free when that page exists, otherwise one page drawn in
  // that shape (recomposed straight from the photo, with no reframed photo made first).
  const editorShapePlan = editorPhoto && !editorPhoto.generating ? shapePlan(editorPhoto) : null;
  const editorShape = editorShapePlan
    ? {
        label: editorShapePlan.target === "portrait" ? "Make it portrait" : "Make it landscape",
        costLabel:
          editorShapePlan.kind === "select" || !signedIn
            ? "Free"
            : editorPhoto && codeCoversAction(code, "generation", editorPhoto)
              ? "Included"
              : code
                ? extraLabel(pagePriceCents)
                : pagePriceCents != null
                  ? formatCredits(pagePriceCents)
                  : null,
      }
    : null;
  // What the page's queued or running job is, so the editor can say so over the page.
  const editorJob = (() => {
    if (!editorPhoto) return null;
    const job = queue.job(editorPhoto.id);
    if (!job) return null;
    const options = job.options;
    const shape = options?.orientation ?? options?.source?.orientation ?? photoOrientation(editorPhoto);
    return {
      status: job.status,
      ahead: job.ahead,
      reshapeTo: shape !== currentShape(editorPhoto) ? shape : null,
    };
  })();

  function changeShape(photoId: string) {
    const photo = photosRef.current.find((p) => p.id === photoId);
    if (!photo) return;
    const plan = shapePlan(photo);
    setUndo(null);
    if (plan.kind === "select") {
      gen.selectRevision(photoId, plan.revisionId);
      return;
    }
    makePages(
      [photoId],
      plan.source
        ? { source: plan.source, addVersion: true }
        : { addVersion: true, ...(plan.orientation ? { orientation: plan.orientation } : {}) },
    );
  }

  const editCost = editorPhoto
    ? editorPhoto.remote && signedIn && codeCoversAction(code, "edit", editorPhoto)
      ? "Included"
      : editorPhoto.remote && signedIn && code
        ? (() => {
            const c = sheetUsageCostCents(prices, "edit", editorPhoto.editCount ?? 0);
            return c === 0 ? "Free" : extraLabel(c);
          })()
      : editorPhoto.remote && signedIn
      ? (() => {
          const free = freeEditsPerSheet(prices);
          if ((editorPhoto.editCount ?? 0) < free) return "Free";
          const c = sheetUsageCostCents(prices, "edit", editorPhoto.editCount ?? 0);
          return c != null ? formatCredits(c) : null;
        })()
      : "Free"
    : null;
  // What the next edit in the chat will cost, said under the box so a paid edit is never a surprise.
  const editNotice = (() => {
    if (!editorPhoto?.remote || !signedIn || !prices) return null;
    if (pkgCode) {
      return packageEditNotice(pkgCode, editorPhoto, sheetUsageCostCents(prices, "edit", Number.MAX_SAFE_INTEGER));
    }
    if (code) {
      const paidCents = sheetUsageCostCents(prices, "edit", Number.MAX_SAFE_INTEGER);
      const paid = paidCents != null ? formatCredits(paidCents) : null;
      if (codeCoversAction(code, "edit", editorPhoto)) {
        const left = code.bundle.editsPerPage - (editorPhoto.editCount ?? 0);
        return {
          tone: "info" as const,
          text: `${left} of ${code.bundle.editsPerPage} edits included with your code left on this page${paid ? `, then ${paid} each (extra)` : ""}.`,
        };
      }
      const free = freeEditsPerSheet(prices);
      if ((editorPhoto.editCount ?? 0) < free) return null;
      if (!paid) return null;
      return {
        tone: "cost" as const,
        text: code.photos[editorPhoto.id]
          ? `This page's included edits are used. Each edit from here is an extra ${paid}, not covered by your code.`
          : `This page isn't one of your code's included pages. Each edit is an extra ${paid}.`,
      };
    }
    const free = freeEditsPerSheet(prices);
    const used = editorPhoto.editCount ?? 0;
    const paidCents = sheetUsageCostCents(prices, "edit", Math.max(used, free));
    const paid = paidCents != null ? formatCredits(paidCents) : null;
    if (free > 0 && used < free) {
      const left = free - used;
      return {
        tone: "info" as const,
        text:
          left === 1
            ? `1 free edit left on this page${paid ? `, then ${paid} per edit` : ""}.`
            : `${left} of ${free} free edits left on this page.`,
      };
    }
    if (!paid) return null;
    return {
      tone: "cost" as const,
      text:
        free > 0
          ? `You've used your ${free} free edits on this page. Each edit from here costs ${paid}.`
          : `Each edit costs ${paid}.`,
    };
  })();
  const makeCost = !signedIn
    ? "Free"
    : editorPhoto && codeCoversAction(code, "generation", editorPhoto)
      ? "Included"
      : code
        ? extraLabel(pagePriceCents)
        : pagePriceCents != null
          ? formatCredits(pagePriceCents)
          : null;
  const bookPriceLabel =
    order.signedIn && pkgCode && order.purchaseCode && !order.isDigital
      ? order.quoteLoading || order.dueCents == null || !order.addressComplete
        ? BOOK_PACKAGES.orderButtonPrintingIncludedShipping
        : order.dueCents - (order.shippingCents ?? 0) - (order.taxCents ?? 0) <= 0
          ? BOOK_PACKAGES.orderButtonPrintingIncluded
          : `${formatCredits(order.dueCents)} extra`
    : order.signedIn && order.purchaseCode && order.dueCents != null && !order.quoteLoading
      ? order.dueCents === 0
        ? "Included"
        : `${formatCredits(order.dueCents)} extra`
      : order.signedIn && order.quoteCents != null && !order.quoteLoading
      ? order.isDigital
        ? formatCredits(order.quoteCents)
        : `${formatCredits(order.printCents ?? order.quoteCents)} + shipping`
      : null;
  // The one photo behind the page on show: new pages and edits start from it.
  const editorSource = editorPhoto ? pageSourceVersion(editorPhoto) : null;

  const panel = (
    <BookOrderPanel
      order={order}
      withoutPage={withoutPageIds.length + failedCount}
      leftOut={book.leftOut}
      openRow={openRow}
      onOpenRow={setOpenRow}
      onShowGallery={showGallery}
      onDiscarded={() => {
        setBookOpen(false);
        toast.info("Your pages are still here.", "Book discarded");
      }}
    />
  );
  const buyButton = order.signedIn && hasBookPage ? <ConfirmButton order={order} blocker={blocker} onConfirm={openConfirm} /> : undefined;

  // A new album left as it came (made-up name, no photos, nothing bought for it) is asked about
  // on the way out. Not the only album (one always exists), and not one shared with you.
  const untouchedAlbumId =
    hydrated &&
    !albumLoading &&
    activeProject &&
    activeProject.role !== "contributor" &&
    projects.length > 1 &&
    photos.length + pendingUploads.length === 0 &&
    !addPhotos &&
    isAutomaticAlbumName(activeProject.name) &&
    (!signedIn || (albumCode.loaded && !code))
      ? activeProject.id
      : null;

  return (
    <V2StudioFrame pageScroll hideBottomNav={showBookBar || deletion.active}>
      <div className="flex w-full min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
        {addPhotos ? (
          <AddPhotosModal
            initialFiles={addPhotos.files}
            signedIn={signedIn}
            autoOn={autoOn}
            onAutoChange={setAuto}
            autoPortrait={autoPortrait}
            onAutoPortraitChange={setAutoPortrait}
            pagePriceCents={pagePriceCents}
            codePagesLeft={code ? newPagesCovered(code) : null}
            pkg={
              pkgCode
                ? {
                    photosLeft: packagePhotosLeft(pkgCode, photos.map((p) => p.id)),
                    includedPhotos: pkgCode.bundle.includedPages,
                    balanceCents,
                  }
                : null
            }
            onClose={() => setAddPhotos(null)}
            onUpload={(files) => {
              setAddPhotos(null);
              void ingestFiles(files);
            }}
          />
        ) : null}
        <V2LibraryMigrationBanner />
        <p className="sr-only" aria-live="polite" role="status">
          {liveMessage}
        </p>

        {/* The album toolbar spans the full width and stays put: it sits above the gallery and the
            book card, so it doesn't shrink or slide when the book opens. */}
        <div className="sticky top-0 z-20 bg-v2-bg/95 px-4 pb-2 pt-2 backdrop-blur lg:px-6">
          <StudioHeader
            pageCount={order.contentCount}
            photoCount={photos.length}
            uploading={uploading}
            onAddPhotos={() => setAddPhotos({ files: [] })}
            pkgAdd={
              pkgCode
                ? {
                    photosLeft: packagePhotosLeft(pkgCode, photos.map((p) => p.id)),
                    priceLabel: pagePriceCents != null ? formatCredits(pagePriceCents) : null,
                  }
                : null
            }
            onSelectPhotos={deletion.enter}
            selectDisabled={activeCount > 0}
            selecting={deletion.active}
            onCancelSelect={deletion.exit}
            onArrange={() => setArrangeOpen(true)}
            book={
              hasBookPage && !bookCardOpen && !deletion.active && !showBookBar
                ? { label: bookProgress ? "Your book" : "Make a book", inProgress: bookProgress != null, onOpen: openBook }
                : null
            }
          />
        </div>

        <div className="relative flex w-full min-w-0 flex-1 lg:min-h-0 lg:overflow-hidden">
          {/* Gallery: full width on phones, the right 60% on desktop while the book is open. The width
              eases as the book rises or sinks, and the cards glide to their new spots (StudioGallery). */}
          <main
            ref={galleryRef}
            aria-label="Studio"
            className={`relative w-full min-w-0 px-4 lg:ml-auto lg:overflow-y-auto lg:px-6 lg:pb-8 lg:transition-[width] lg:duration-500 lg:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              bookCardOpen ? "lg:w-[58%] xl:w-[60%]" : "lg:w-full"
            } ${
              deletion.active
                ? "pb-[calc(9rem+env(safe-area-inset-bottom))]"
                : showBookBar
                  ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
                  : "pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
            }`}
            onDragOver={onDragOver}
            onDragLeave={() => setDropping(false)}
            onDrop={onDrop}
          >
            <div className="space-y-3">
              {pkgCode && activeProjectId && !deletion.active ? (
                <PackageMeter
                  code={pkgCode}
                  inFlight={photos.filter((p) => !pkgCode.photos[p.id] && queue.job(p.id)).length}
                  pagePriceCents={pagePriceCents}
                  theme={activeProject?.designTheme ?? null}
                  canEditTheme={activeProject?.role !== "contributor"}
                  onAddPhotos={() => setAddPhotos({ files: [] })}
                  onOrderBook={openBook}
                  onEditTheme={() => setThemeOpen(true)}
                  onCancelPackage={
                    pkgCode.isBuyer && !pkgCode.bookOrderId ? () => setCancelPkgOpen(true) : undefined
                  }
                  canOrder={hasBookPage}
                />
              ) : code && !pkgCode && !deletion.active ? (
                <AlbumCodeBanner
                  code={code}
                  photoCount={photos.length}
                  onAddPhotos={() => setAddPhotos({ files: [] })}
                  onOrderBook={openBook}
                  canOrder={hasBookPage}
                />
              ) : null}
              {showStrip ? (
                <UploadStrip
                  pagePriceCents={pagePriceCents}
                  balanceCents={signedIn ? balanceCents : null}
                  choiceCount={choiceIds?.length ?? null}
                  onChoose={chooseAuto}
                  shortCount={shortCount}
                  onAddCredit={() => setAddCreditFor(pagePriceCents != null ? pagePriceCents * shortCount : 0)}
                />
              ) : null}

              {withoutPageIds.length >= 2 && activeCount === 0 && !uploading && !deletion.active ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 text-v2-ink">
                    {withoutPageIds.length} photos have no page yet
                  </span>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-v2-link"
                    onClick={() => makePages(withoutPageIds)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                    Make the rest
                    <span className="font-normal text-v2-muted">
                      ({restCostLabel(withoutPageIds.length)})
                    </span>
                  </button>
                </div>
              ) : null}

              {bookCardOpen && photos.length >= 2 && !deletion.active ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-v2-primary-light/70 px-3 py-2 text-sm text-v2-navy">
                  <p className="flex min-w-0 flex-1 basis-72 items-start gap-2">
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
                    <span>
                      <span className="font-semibold">Your book prints pages in this order.</span>{" "}
                      <span className="pointer-coarse:hidden">Drag a page to move it.</span>
                      <span className="hidden pointer-coarse:inline">Press and hold a page to move it.</span>{" "}
                      Tap the circle on a page to include it (checked) or leave it out (empty).
                    </span>
                  </p>
                  {bookChoices.length >= 2 ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={bookChoicesIn === bookChoices.length ? true : bookChoicesIn === 0 ? false : "mixed"}
                      onClick={() => {
                        const include = bookChoicesIn < bookChoices.length;
                        for (const photo of bookChoices) gen.setBookPrefs(photo.id, { leftOut: !include });
                      }}
                      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-white/80 py-1 pl-1.5 pr-3 font-semibold text-v2-navy shadow-sm transition hover:bg-white"
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
                          bookChoicesIn === 0 ? "border-gray-400 bg-white" : "border-v2-primary bg-v2-primary text-white",
                        )}
                        aria-hidden
                      >
                        {bookChoicesIn === bookChoices.length ? (
                          <Check className="h-4 w-4" strokeWidth={3} />
                        ) : bookChoicesIn > 0 ? (
                          <Minus className="h-4 w-4" strokeWidth={3} />
                        ) : null}
                      </span>
                      {bookChoicesIn === bookChoices.length ? "Leave all out" : "Include all"}
                      <span className="font-normal tabular-nums text-v2-muted">
                        {bookChoicesIn} of {bookChoices.length} in book
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}

              {albumLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]" role="status" aria-label="Loading album">
                  {Array.from({ length: 6 }, (_, i) => (
                    <GallerySkeletonCard key={i} />
                  ))}
                </div>
              ) : photos.length + pendingUploads.length === 0 ? (
                <StudioEmptyAlbum
                  key={activeProjectId ?? "none"}
                  albumName={activeProject?.name ?? ""}
                  canRename={activeProject?.role !== "contributor"}
                  onRename={renameActiveProject}
                  onChoose={() => setAddPhotos({ files: [] })}
                  onFiles={(files) => setAddPhotos({ files })}
                  onHowItWorks={welcomeGuide.open}
                  line={STUDIO_EMPTY.lineByIntent[readIntent()] ?? STUDIO_EMPTY.line}
                  guest={!cloud}
                  pkg={
                    pkgCode
                      ? {
                          code: pkgCode,
                          photosLeft: packagePhotosLeft(pkgCode, photos.map((p) => p.id)),
                          theme: activeProject?.designTheme ?? null,
                          canEditTheme: activeProject?.role !== "contributor",
                          onEditTheme: () => setThemeOpen(true),
                        }
                      : null
                  }
                />
              ) : (
                <StudioGallery
                  photos={photos}
                  pendingUploads={pendingUploads.length}
                  cardInfo={cardInfo}
                  selectMode={deletion.active}
                  selectedIds={deletion.selectedIds}
                  onToggleSelect={deletion.toggle}
                  onOpen={openEditor}
                  onMake={(id) => {
                    queue.clearFailure(id);
                    makePages([id]);
                  }}
                  onCancel={(id) => {
                    queue.cancel([id]);
                    dropAwaiting(id);
                  }}
                  onToggleLeftOut={(id) => {
                    const p = photosRef.current.find((e) => e.id === id);
                    gen.setBookPrefs(id, { leftOut: !p?.printPrefs.book?.leftOut });
                  }}
                  onDelete={deletePhoto}
                  onPrint={(id) => setOutput({ id, mode: "all" })}
                  onReorder={replacePhotos}
                  showReorderHint={!bookCardOpen}
                  bookMode={bookCardOpen}
                  arrangeOpen={arrangeOpen}
                  onArrangeClose={() => setArrangeOpen(false)}
                />
              )}

              {!cloud && photos.length > 0 ? <V2SavePromptCard pageCount={order.contentCount} fallback={null} /> : null}
            </div>
            {dropping ? (
              <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-v2-primary bg-v2-primary-light/80 text-sm font-semibold text-v2-navy">
                Drop photos to add them
              </div>
            ) : null}
            {/* Room below the last row, so the docked progress bar never covers it. */}
            {uploadProgress ? <div aria-hidden className="h-24" /> : null}
          </main>

          {/* The book being built: a card docked to the bottom edge left of the gallery on desktop,
              only once they start it. Positioned over the gallery's freed-up space, so the gallery
              can ease its width instead of being squeezed. */}
          <DockedBookPresence open={bookCardOpen}>
            {(leaving) => (
              <aside
                className="hidden lg:absolute lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[42%] lg:flex-col lg:pt-4 lg:pl-4 xl:w-[40%] xl:pl-6"
                aria-label="Your book"
              >
                <BookOrderCard order={order} onClose={() => setBookOpen(false)} footer={buyButton} leaving={leaving}>
                  {panel}
                </BookOrderCard>
              </aside>
            )}
          </DockedBookPresence>
        </div>
      </div>

      {/* Only once a coloring page is finished: a page still drawing isn't something to book yet. */}
      {/* Docked at the bottom, in sight wherever the gallery is scrolled. */}
      {uploadProgress && !deletion.active && !editor ? (
        <UploadProgressBar
          progress={uploadProgress}
          onStopRest={queue.queued > 0 ? () => queue.cancel() : undefined}
          className={
            showBookBar
              ? "bottom-[calc(5rem+env(safe-area-inset-bottom))]"
              : "bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-6"
          }
        />
      ) : null}

      {/* Held back while photos are still being added or drawn: the book can wait until they're all in. */}
      {order.contentCount > 0 && !bookCardOpen && !deletion.active && !showBookBar && !editor && !bookPromoHidden && !uploadProgress ? (
        <BookPromoCard
          pageCount={order.contentCount}
          pictures={book.pages.slice(0, 3).map((page) => page.imageDataUrl)}
          progress={bookProgress}
          onStart={openBook}
          onDismiss={() => setBookPromoHidden(true)}
        />
      ) : null}

      {deletion.active ? (
        <div
          role="region"
          aria-label="Selected photos"
          className={`fixed inset-x-0 bottom-0 z-50 bg-v2-primary px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-white shadow-[0_-8px_24px_rgb(10_16_26/0.18)] sm:pt-3 lg:right-0 ${
            bookCardOpen ? "lg:left-[42%] xl:left-[40%]" : ""
          }`}
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex min-w-0 items-center gap-1 sm:flex-1 sm:gap-3">
              <p className="min-w-0 flex-1 text-sm font-semibold tabular-nums sm:flex-none" aria-live="polite">
                {deletion.selectedIds.size === 0 ? "Pick photos" : `${deletion.selectedIds.size} selected`}
              </p>
              <button
                type="button"
                className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-white underline-offset-2 hover:underline"
                onClick={deletion.toggleAll}
              >
                {deletion.allSelected ? "Deselect all" : "Select all"}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-white underline-offset-2 hover:underline sm:hidden"
                onClick={deletion.exit}
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0 sm:items-center">
              <button
                type="button"
                className="hidden min-h-11 items-center rounded-full border border-white/60 px-4 text-sm font-semibold text-white transition hover:bg-white/10 sm:inline-flex"
                onClick={deletion.exit}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletion.selectedIds.size === 0}
                onClick={() => setBulk("move")}
                className="inline-flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/60 px-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50 sm:min-h-11 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:text-sm"
              >
                <FolderInput className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden />
                <span>
                  Move<span className="hidden sm:inline"> to album</span>
                </span>
              </button>
              <button
                type="button"
                disabled={deletion.selectedIds.size === 0}
                onClick={() => setBulk("download")}
                className="inline-flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/60 px-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50 sm:min-h-11 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:text-sm"
              >
                <Download className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden />
                Download
              </button>
              <button
                type="button"
                disabled={deletion.selectedIds.size === 0}
                onClick={deletion.requestSelected}
                className="inline-flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-white px-2 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50 sm:min-h-11 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:text-sm"
              >
                <Trash2 className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden />
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : showBookBar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-semibold text-v2-ink">
                {bookProgress ? "Your book" : "Your pages"} ·{" "}
                {bookProgress?.summary ?? `${order.contentCount} ${order.contentCount === 1 ? "page" : "pages"}`}
              </span>
              <span className="block truncate text-xs text-v2-muted">
                {bookPriceLabel ??
                  (bookProgress
                    ? `${bookProgress.done} of ${bookProgress.total} steps done`
                    : "Printed, bound and mailed to you")}
              </span>
            </p>
            <button type="button" className="v2-btn-primary min-h-11 shrink-0 gap-1.5 px-5 text-sm" onClick={openBook}>
              {bookProgress ? (
                "Continue"
              ) : (
                <>
                  <BookOpen className="h-4 w-4" aria-hidden />
                  Make a book
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {bookOpen && !desktop ? (
        <BottomSheet title="Your book" onClose={() => setBookOpen(false)} footer={buyButton}>
          {panel}
        </BottomSheet>
      ) : null}

      {editorPhoto ? (
        <PageEditorModal
          photo={editorPhoto}
          index={editorIndex}
          total={photos.length}
          initialView={editor!.view}
          state={cardState(editorPhoto)}
          failureMessage={queue.failures[editorPhoto.id]}
          busy={locks.busy.has(editorPhoto.id) || editorPhoto.generating || Boolean(editorPhoto.correcting) || queue.status(editorPhoto.id) != null}
          makeCostLabel={makeCost}
          editCostLabel={editCost}
          leftOut={editorPhoto.printPrefs.book?.leftOut === true}
          canShare={Boolean(activePageVersion(editorPhoto))}
          onClose={closeEditor}
          onPrev={editorIndex > 0 ? () => moveEditor(-1) : null}
          onNext={editorIndex < photos.length - 1 ? () => moveEditor(1) : null}
          onMake={() => {
            queue.clearFailure(editorPhoto.id);
            makePages([editorPhoto.id], editorSource ? { source: editorSource } : undefined);
          }}
          onDrawAgain={() => {
            // A page turned to the other shape than its photo is drawn again in that shape.
            const shape = activePageVersion(editorPhoto)?.orientation;
            makePages(
              [editorPhoto.id],
              editorSource
                ? { source: editorSource, addVersion: true }
                : { addVersion: true, ...(shape && shape !== photoOrientation(editorPhoto) ? { orientation: shape } : {}) },
            );
          }}
          onQuickFix={(kind) => void quickFix(kind)}
          onSelectRevision={(revisionId) => {
            setUndo(null);
            gen.selectRevision(editorPhoto.id, revisionId);
          }}
          onEditWithNote={() => {
            gen.startEditChat();
            setEditChatOpen(true);
          }}
          onPrint={() => {
            const p = editorPhoto;
            void pdfOnDemand.print(() => makePagePdf(p)).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not make a PDF."));
          }}
          onDownload={() => {
            const p = editorPhoto;
            void pdfOnDemand.download(() => makePagePdf(p)).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not make a PDF."));
          }}
          onShare={() => setOutput({ id: editorPhoto.id, mode: "send" })}
          pdfBusy={pdfOnDemand.busy}
          shape={editorShape}
          job={editorJob}
          onChangeShape={() => changeShape(editorPhoto.id)}
          onToggleLeftOut={() => gen.setBookPrefs(editorPhoto.id, { leftOut: !editorPhoto.printPrefs.book?.leftOut })}
          onDelete={() => {
            closeEditor();
            deletePhoto(editorPhoto.id);
          }}
          addToAlbum={
            cloud && editorPhoto.remote
              ? {
                  albums: projects,
                  currentAlbumId: activeProjectId,
                  onAdd: async (destination) => {
                    const res = await copyPhotoToAlbum(editorPhoto.remote!.photoId, destination);
                    if (res.error) throw new Error(res.error.message);
                    const meta = projectMetaFromLibrary(res.data!.project);
                    upsertProject(meta);
                    toast.success({
                      title: "Photo added",
                      message: `A copy is now in ${meta.name || "your new album"}${"newAlbumName" in destination ? ", your new album" : ""}.`,
                    });
                  },
                }
              : undefined
          }
          onUndo={
            undo && undo.photoId === editorPhoto.id
              ? () => {
                  gen.selectRevision(undo.photoId, undo.revisionId);
                  setUndo(null);
                }
              : undefined
          }
        />
      ) : null}

      {editorPhoto?.sheet ? (
        <V2SheetEditChat
          open={editChatOpen}
          onClose={() => setEditChatOpen(false)}
          originalPreviewUrl={editorSource?.sheet.imageDataUrl ?? editorPhoto.previewUrl}
          sheetImageUrl={editorPhoto.sheet.imageDataUrl}
          messages={gen.editMessages}
          onSend={(text) => void gen.applySheetEdit(editorPhoto.id, text)}
          busy={Boolean(editorPhoto.correcting)}
          disabled={!activePageVersion(editorPhoto)}
          costNotice={editNotice}
        />
      ) : null}

      {outputPhoto && activePageVersion(outputPhoto) ? (
        <PagePrintShareModal
          key={`${outputPhoto.id}:${activePageVersion(outputPhoto)!.id}:${output!.mode}`}
          mode={output!.mode}
          sheetSrc={activePageVersion(outputPhoto)!.sheet.imageDataUrl}
          makePdf={() => makePagePdf(outputPhoto)}
          share={
            !cloud || !outputPhoto.remote
              ? { kind: "guest" }
              : outputPhoto.canDelete === false
                ? { kind: "not-owner" }
                : { kind: "ready", photoId: outputPhoto.remote.photoId, revisionId: activePageVersion(outputPhoto)!.id }
          }
          onClose={() => setOutput(null)}
        />
      ) : null}

      {confirm ? (
        <ConfirmPurchaseModal
          order={order}
          initialStep={confirm.step}
          autoPlace={confirm.autoPlace}
          onClose={() => setConfirm(null)}
          onFixPage={(libraryPhotoId) => {
            const target = photosRef.current.find((p) => (p.remote?.photoId ?? p.id) === libraryPhotoId);
            setConfirm(null);
            if (!desktop) setBookOpen(false);
            if (target) openEditor(target.id, "page");
          }}
          onAddPhoto={() => {
            // The book updates as the new photo's page is made; the proof then asks only about what changed.
            setConfirm(null);
            if (!desktop) setBookOpen(false);
            setAddPhotos({ files: [] });
          }}
          onEditRow={(row) => {
            setConfirm(null);
            setOpenRow(row);
            setBookOpen(true);
          }}
        />
      ) : null}

      {order.addCredit ? (
        <V2AddCreditModal
          onClose={order.closeAddCredit}
          returnPath={order.addCredit.returnPath}
          shortfallCents={order.addCredit.cents}
          shortfallFor="this book"
        />
      ) : null}
      {addCreditFor != null ? (
        <V2AddCreditModal
          onClose={() => setAddCreditFor(null)}
          returnPath="/studio"
          shortfallCents={addCreditFor || null}
          shortfallFor={pkgCode ? BOOK_PACKAGES.addCreditFor[2] : "these pages"}
          packageNote={
            pkgCode
              ? packageUntouchedNote({
                  bindingNameLower: String(pkgTokens?.bindingNameLower ?? ""),
                  photosLeft: packagePhotosLeft(pkgCode, photos.map((p) => p.id)),
                  ordered: Boolean(pkgCode.bookOrderId),
                })
              : null
          }
        />
      ) : null}
      {sheetCredits.addCreditModal}
      {cancelPkgOpen && activeProjectId ? (
        <CancelPackageModal
          albumId={activeProjectId}
          photoCount={photos.length}
          initialChoice="keep"
          onClose={() => setCancelPkgOpen(false)}
          onCanceled={async ({ refundCents, deleteAlbum }) => {
            const refund = formatCredits(refundCents);
            const albumId = activeProjectId;
            notifyPackageChanged(albumId);
            if (!deleteAlbum) {
              setCancelPkgOpen(false);
              toast.success({
                title: BOOK_PACKAGES.cancelDoneTitle,
                message: fillPackageCopy(BOOK_PACKAGES.cancelDoneBody, { refund }) ?? "",
              });
              return;
            }
            try {
              await deleteProject(albumId);
              setCancelPkgOpen(false);
              toast.success({
                title: BOOK_PACKAGES.cancelDoneTitle,
                message: fillPackageCopy(BOOK_PACKAGES.cancelDoneDeleted, { refund }) ?? "",
              });
              router.push(SIGNED_IN_HOME);
            } catch {
              setCancelPkgOpen(false);
              toast.error(fillPackageCopy(BOOK_PACKAGES.cancelDeleteFailed, { refund }) ?? "Could not delete the album.");
            }
          }}
        />
      ) : null}
      {themeOpen && activeProjectId ? (
        <ThemeModal
          albumId={activeProjectId}
          albumName={activeProject?.name ?? "Album"}
          theme={activeProject?.designTheme ?? null}
          onSaved={(theme) => setProjectDesignTheme(activeProjectId, theme)}
          onClose={() => setThemeOpen(false)}
        />
      ) : null}
      {guestLimit ? (
        <V2GuestLimitModal scope={guestLimit.scope} kind={guestLimit.kind} onClose={() => setGuestLimit(null)} />
      ) : null}
      {deletion.modal}
      <KeepAlbumPrompt albumId={untouchedAlbumId} onDiscard={deleteProject} />
      {bulk === "move" && selectedPhotos.length > 0 ? (
        <MoveSelectedDialog photos={selectedPhotos} onClose={() => setBulk(null)} onDone={deletion.exit} />
      ) : null}
      {bulk === "download" && selectedPhotos.length > 0 ? (
        <DownloadSelectedDialog
          photos={selectedPhotos}
          albumName={activeProject?.name ?? "album"}
          makePagePdf={makePagePdf}
          onClose={() => setBulk(null)}
        />
      ) : null}
    </V2StudioFrame>
  );
}
