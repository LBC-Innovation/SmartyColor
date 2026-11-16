"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Loader2, Pencil, Trash2 } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2GuestLimitModal } from "@/components/v2/auth/V2GuestLimitModal";
import { V2LibraryMigrationBanner } from "@/components/v2/V2LibraryMigrationBanner";
import { PagePrintShareModal } from "@/components/v2/studio/PagePrintShareModal";
import { V2SheetEditChat } from "@/components/v2/V2SheetEditChat";
import { V2UploadDropzone } from "@/components/v2/V2UploadDropzone";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import { V2AddCreditModal } from "@/components/v2/credits/V2AddCreditModal";
import { useSheetUsageCredits } from "@/components/v2/credits/useSheetUsageCredits";
import { useV2LibraryDeletion } from "@/components/v2/library/useV2LibraryDeletion";
import { useV2PhotoIngest } from "@/components/v2/library/useV2PhotoIngest";
import { useV2PhotoTransforms } from "@/components/v2/library/useV2PhotoTransforms";
import { V2SavePromptCard } from "@/components/v2/marketing/V2SavePromptCard";
import { useV2WelcomeGuide } from "@/components/v2/onboarding/V2WelcomeGuide";
import { PageEditorModal, type EditorView } from "@/components/v2/studio/PageEditorModal";
import { shapePlan } from "@/components/v2/studio/pageShape";
import { useOnDemandPdf } from "@/components/v2/usePrintablePdf";
import { StudioGallery } from "@/components/v2/studio/StudioGallery";
import { StudioHeader } from "@/components/v2/studio/StudioHeader";
import { UploadStrip } from "@/components/v2/studio/UploadStrip";
import { PLACEHOLDER_ALBUM_NAME } from "@/components/v2/studio/albumNames";
import { GallerySkeletonCard, type CardState } from "@/components/v2/studio/GalleryCard";
import { usePhotoLocks } from "@/components/v2/studio/usePhotoLocks";
import { useSheetGeneration, type GenerateOptions } from "@/components/v2/studio/useSheetGeneration";
import { useSheetQueue, type BatchSummary } from "@/components/v2/studio/useSheetQueue";
import { BookOrderCard } from "@/components/v2/studio/order/BookOrderCard";
import { BookOrderPanel, ConfirmButton, bookSteps, confirmBlocker, formatSummary, type OrderRow } from "@/components/v2/studio/order/BookOrderPanel";
import { BookPromoCard, type BookProgress } from "@/components/v2/studio/order/BookPromoCard";
import { BottomSheet } from "@/components/v2/studio/order/BottomSheet";
import { ConfirmPurchaseModal, type ConfirmStep } from "@/components/v2/studio/order/ConfirmPurchaseModal";
import { activePageVersion, galleryBook, pagePrintPrefs, pageSourceVersion } from "@/components/v2/studio/order/galleryBookPages";
import { useBookOrder } from "@/components/v2/studio/order/useBookOrder";
import { BEST_PHOTOS, INTENT_ALBUM_NAME, STUDIO_EMPTY } from "@/content/marketing";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/api/client";
import type { GuestLimitScope } from "@/lib/guestLimit";
import { formatCredits } from "@/lib/credits/money";
import { freeEditsPerSheet, sheetUsageCostCents } from "@/lib/credits/pricing";
import { fillCopy, readIntent } from "@/lib/marketing/copy";
import { formatPhotoSizeLimit, PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo/payloadBudget";
import type { QuickFixKind } from "@/lib/photo/sheetQuickFixes";
import { usePriceList } from "@/lib/pricing/usePriceList";
import { photoOrientation, type V2PhotoEntry } from "@/lib/v2/studioTypes";

const INTENT_NAMED_KEY = "cm_intent_named";
/** "Make pages as I add", remembered per device: "on", "off", or unset (not chosen yet). */
const AUTOPAGE_KEY = "cm_autopage";
/** "on" turns landscape photos portrait as they are added. Off unless chosen: it uses credit. */
const AUTOPORTRAIT_KEY = "cm_autoportrait";
/** Photos reframed at the same time while adding a batch. */
const REFRAME_CONCURRENCY = 3;
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
  // The order panel handles the return from adding credit, so it can finish the purchase.
  const sheetCredits = useSheetUsageCredits("/studio", { handleCheckoutReturn: false });
  const [guestLimit, setGuestLimit] = useState<{ scope: GuestLimitScope; kind: "page" | "edit" } | null>(null);
  const guestLimitShownRef = useRef(false);
  const showGuestLimit = useCallback((scope: GuestLimitScope, kind: "page" | "edit") => {
    if (kind === "page" && guestLimitShownRef.current) return;
    if (kind === "page") guestLimitShownRef.current = true;
    setGuestLimit({ scope, kind });
  }, []);
  const gen = useSheetGeneration({ sheetCredits, locks, onGuestLimit: showGuestLimit });
  const photoTransforms = useV2PhotoTransforms({ sheetCredits, locks });

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
  const portraitPriceCents = signedIn ? sheetUsageCostCents(prices, "portrait") : null;
  const balanceCents = user?.creditsBalanceCents ?? null;

  /** How many more pages the wallet covers, after what is already running or waiting. */
  function pagesAffordable(): number {
    if (!signedIn || pagePriceCents == null || pagePriceCents <= 0 || balanceCents == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor(balanceCents / pagePriceCents) - (queue.running + queue.queued));
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
    return queue.enqueue(take, options);
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

  // ---- "Turn landscape photos portrait" ------------------------------------------------
  const [autoPortrait, setAutoPortraitState] = useState<boolean>(readAutoPortrait);
  const [reframing, setReframing] = useState(0);
  function setAutoPortrait(on: boolean) {
    writeAutoPortrait(on);
    setAutoPortraitState(on);
  }

  /**
   * Reframes landscape photos to portrait a few at a time, then (when pages are being made) draws
   * each page from its portrait version. A photo whose reframe fails still gets its page, drawn
   * from the photo as it is.
   */
  async function reframeThenDraw(ids: string[], draw: boolean) {
    if (ids.length === 0) return;
    setReframing((n) => n + ids.length);
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const version = await photoTransforms.reframePhoto(id, "portrait", { quiet: true });
        setReframing((n) => n - 1);
        if (!draw) continue;
        if (version) makePages([id], { source: version, addVersion: true });
        else makePages([id]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(REFRAME_CONCURRENCY, ids.length) }, worker));
  }

  /** What happens to a batch once it's known whether pages are made for it. */
  function startBatch(ids: string[], draw: boolean) {
    const landscape = autoPortrait
      ? ids.filter((id) => {
          const p = photosRef.current.find((e) => e.id === id);
          return p ? photoOrientation(p) === "landscape" : false;
        })
      : [];
    if (!signedIn) {
      // Guests share one small free allowance per batch between reframes and pages.
      const reframe = landscape.slice(0, GUEST_AUTO_BATCH);
      const direct = ids.filter((id) => !reframe.includes(id));
      if (draw) queue.enqueue(direct.slice(0, Math.max(0, GUEST_AUTO_BATCH - reframe.length)));
      void reframeThenDraw(reframe, draw);
      return;
    }
    const direct = ids.filter((id) => !landscape.includes(id));
    if (draw) makePages(direct);
    void reframeThenDraw(landscape, draw);
  }

  function onPhotosAdded(added: V2PhotoEntry[]) {
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

  const ingestFiles = useV2PhotoIngest({ onAdded: onPhotosAdded });
  const fileRef = useRef<HTMLInputElement>(null);

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
  const deletion = useV2LibraryDeletion();

  function deletePhoto(id: string) {
    queue.cancel([id]);
    deletion.request([id]);
  }

  // ---- card states ---------------------------------------------------------------------
  function cardState(photo: V2PhotoEntry): CardState {
    const q = queue.status(photo.id);
    if (q === "queued") return "queued";
    if (photo.generating || q === "running") return "drawing";
    if (activePageVersion(photo)) return "ready";
    if (queue.failures[photo.id]) return "failed";
    return "none";
  }
  const giftOffset = order.giftNotePage ? 1 : 0;
  const cardInfo = (photo: V2PhotoEntry) => {
    const position = book.positionByPhotoId.get(photo.id);
    return {
      state: cardState(photo),
      // Page numbers only once a book is being built: the gallery is just pages otherwise.
      bookNumber: (bookOpen || order.started) && position != null ? position + giftOffset : null,
      leftOut: photo.printPrefs.book?.leftOut === true,
      failureMessage: queue.failures[photo.id],
    };
  };

  const withoutPageIds = photos
    .filter((p) => !p.printPrefs.book?.leftOut && cardState(p) === "none")
    .map((p) => p.id);
  const failedCount = photos.filter((p) => cardState(p) === "failed").length;
  const uploading = pendingUploads.length > 0;
  const activeCount = queue.running + queue.queued;
  const showStrip =
    uploading || activeCount > 0 || reframing > 0 || choiceIds != null || shortCount > 0;

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
    void ingestFiles(e.dataTransfer.files);
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
  const bookCardOpen = desktop && bookOpen && hasBookPage;
  // Phones: once a book is under way, the book bar replaces the tab bar (the header menu has the tabs).
  const showBookBar = !desktop && hasBookPage && !editor && bookProgress != null;
  // Turning the page to the other shape: free when that page exists, a page when the photo
  // already has that shape, otherwise reframing the photo and then a page.
  const editorShapePlan = editorPhoto && !editorPhoto.generating ? shapePlan(editorPhoto) : null;
  const editorShape = editorShapePlan
    ? {
        label: editorShapePlan.target === "portrait" ? "Make it portrait" : "Make it landscape",
        costLabel:
          editorShapePlan.kind === "select"
            ? "Free"
            : !signedIn
              ? "Free"
              : editorShapePlan.kind === "draw"
                ? pagePriceCents != null
                  ? formatCredits(pagePriceCents)
                  : null
                : pagePriceCents != null && portraitPriceCents != null
                  ? formatCredits(pagePriceCents + portraitPriceCents)
                  : null,
      }
    : null;

  async function changeShape(photoId: string) {
    const photo = photosRef.current.find((p) => p.id === photoId);
    if (!photo) return;
    const plan = shapePlan(photo);
    setUndo(null);
    if (plan.kind === "select") {
      gen.selectRevision(photoId, plan.revisionId);
      return;
    }
    if (plan.kind === "draw") {
      makePages([photoId], plan.source ? { source: plan.source, addVersion: true } : { addVersion: true });
      return;
    }
    const version = await photoTransforms.reframePhoto(photoId, plan.target, { quiet: true });
    if (version) makePages([photoId], { source: version, addVersion: true });
  }

  const editCost = editorPhoto
    ? editorPhoto.remote && signedIn
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
  const makeCost = signedIn ?(pagePriceCents != null ? formatCredits(pagePriceCents) : null) : "Free";
  const bookPriceLabel =
    order.signedIn && order.quoteCents != null && !order.quoteLoading
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

  return (
    <V2StudioFrame pageScroll hideBottomNav={showBookBar}>
      <div className="flex w-full min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="sr-only"
          onChange={(event) => {
            const list = event.target.files;
            if (list?.length) void ingestFiles(list);
            event.target.value = "";
          }}
        />
        <V2LibraryMigrationBanner />
        <p className="sr-only" aria-live="polite" role="status">
          {liveMessage}
        </p>

        <div className="flex w-full min-w-0 flex-1 lg:min-h-0 lg:overflow-hidden">
          {/* Gallery: full width on phones, 60% on desktop */}
          <main
            ref={galleryRef}
            aria-label="Studio"
            className={`relative w-full min-w-0 px-4 lg:overflow-y-auto lg:px-6 lg:pb-8 ${
              bookCardOpen ? "lg:w-[58%] xl:w-[60%]" : "lg:w-full"
            } ${
              showBookBar ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))]" : "pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
            }`}
            onDragOver={onDragOver}
            onDragLeave={() => setDropping(false)}
            onDrop={onDrop}
          >
            <div className="sticky top-0 z-20 -mx-4 bg-v2-bg/95 px-4 pb-2 pt-2 backdrop-blur lg:-mx-6 lg:px-6">
              <StudioHeader
                pageCount={order.contentCount}
                photoCount={photos.length}
                uploading={uploading}
                onAddPhotos={() => fileRef.current?.click()}
                onSelectPhotos={deletion.enter}
                selectDisabled={activeCount > 0}
                autoMake={autoOn}
                onAutoMakeChange={setAuto}
                autoPortrait={autoPortrait}
                onAutoPortraitChange={setAutoPortrait}
                book={
                  hasBookPage && !bookCardOpen && !deletion.active
                    ? { label: bookProgress ? "Your book" : "Make a book", inProgress: bookProgress != null, onOpen: openBook }
                    : null
                }
              />
            </div>

            <div className="space-y-3">
              {showStrip ? (
                <UploadStrip
                  signedIn={signedIn}
                  autoOn={autoOn}
                  onAutoChange={setAuto}
                  autoPortraitOn={autoPortrait}
                  onAutoPortraitChange={setAutoPortrait}
                  portraitPriceCents={portraitPriceCents}
                  reframingCount={reframing}
                  pagePriceCents={pagePriceCents}
                  balanceCents={signedIn ? balanceCents : null}
                  uploading={uploading}
                  activeCount={activeCount}
                  queuedCount={queue.queued}
                  onStopRest={() => queue.cancel()}
                  choiceCount={choiceIds?.length ?? null}
                  onChoose={chooseAuto}
                  shortCount={shortCount}
                  onAddCredit={() => setAddCreditFor(pagePriceCents != null ? pagePriceCents * shortCount : 0)}
                />
              ) : null}

              {withoutPageIds.length >= 2 && activeCount === 0 && !deletion.active ? (
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
                      ({signedIn ? (pagePriceCents != null ? formatCredits(pagePriceCents * withoutPageIds.length) : "uses credit") : "free to try"})
                    </span>
                  </button>
                </div>
              ) : null}

              {bookCardOpen && photos.length >= 2 && !deletion.active ? (
                <p className="flex items-center gap-2 rounded-xl bg-v2-primary-light/70 px-3 py-2 text-sm text-v2-navy">
                  <BookOpen className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
                  <span>
                    <span className="font-semibold">Pages print in this order.</span>{" "}
                    <span className="pointer-coarse:hidden">Drag to move one,</span>
                    <span className="hidden pointer-coarse:inline">Press and hold to move one,</span> or use its ⋮ menu to leave it out.
                  </span>
                </p>
              ) : null}

              {albumLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]" role="status" aria-label="Loading album">
                  {Array.from({ length: 6 }, (_, i) => (
                    <GallerySkeletonCard key={i} />
                  ))}
                </div>
              ) : photos.length + pendingUploads.length === 0 ? (
                <V2UploadDropzone className="min-h-[18rem]" onFiles={(files) => void ingestFiles(files)}>
                  <div className="flex flex-col items-center gap-3 text-center">
                    <h2 className="v2-brand-title text-xl text-v2-ink">{STUDIO_EMPTY.title}</h2>
                    <p className="text-sm text-v2-muted">{STUDIO_EMPTY.lineByIntent[readIntent()] ?? STUDIO_EMPTY.line}</p>
                    <button type="button" onClick={() => fileRef.current?.click()} className="v2-btn-primary v2-breathe min-h-11 w-full max-w-xs">
                      {STUDIO_EMPTY.button}
                    </button>
                    <div className="w-full max-w-xs text-left">
                      <p className="text-xs font-semibold text-v2-navy">{BEST_PHOTOS.title}</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-v2-muted">
                        {BEST_PHOTOS.items.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-[11px] text-v2-muted">
                      {fillCopy(STUDIO_EMPTY.formats, { size: formatPhotoSizeLimit(PHOTO_UPLOAD_MAX_BYTES) })}
                      <span className="hidden pointer-fine:inline"> {STUDIO_EMPTY.dragHint}</span>
                    </p>
                    {!cloud ? <p className="text-[11px] text-v2-muted">{STUDIO_EMPTY.guestNote}</p> : null}
                    <button type="button" onClick={welcomeGuide.open} className="min-h-11 px-3 text-sm font-semibold text-v2-link">
                      {STUDIO_EMPTY.howItWorks}
                    </button>
                  </div>
                </V2UploadDropzone>
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
                  onCancel={(id) => queue.cancel([id])}
                  onToggleLeftOut={(id) => {
                    const p = photosRef.current.find((e) => e.id === id);
                    gen.setBookPrefs(id, { leftOut: !p?.printPrefs.book?.leftOut });
                  }}
                  onDelete={deletePhoto}
                  onPrint={(id) => setOutput({ id, mode: "all" })}
                  onReorder={replacePhotos}
                  showReorderHint={!bookCardOpen}
                />
              )}

              {!cloud && photos.length > 0 ? <V2SavePromptCard pageCount={order.contentCount} fallback={null} /> : null}
            </div>
            {dropping ? (
              <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-v2-primary bg-v2-primary-light/80 text-sm font-semibold text-v2-navy">
                Drop photos to add them
              </div>
            ) : null}
          </main>

          {/* The book being built: a card beside the gallery on desktop, only once they start it */}
          {bookCardOpen ? (
            <aside className="hidden min-h-0 lg:flex lg:w-[42%] lg:flex-col lg:py-4 lg:pr-4 xl:w-[40%] xl:pr-6" aria-label="Your book">
              <BookOrderCard order={order} onClose={() => setBookOpen(false)} footer={buyButton}>
                {panel}
              </BookOrderCard>
            </aside>
          ) : null}
        </div>
      </div>

      {hasBookPage && !bookCardOpen && !deletion.active && !showBookBar && !editor && !bookPromoHidden ? (
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
          className={`fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:left-0 ${
            bookCardOpen ? "lg:right-[42%] xl:right-[40%]" : ""
          }`}
        >
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <button type="button" className="v2-btn-outline min-h-11 px-4 text-sm" onClick={deletion.exit}>
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
              disabled={deletion.selectedIds.size === 0}
              onClick={deletion.requestSelected}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete {deletion.selectedIds.size} {deletion.selectedIds.size === 1 ? "photo" : "photos"}
            </button>
          </div>
        </div>
      ) : showBookBar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-semibold text-v2-ink">
                Your book · {bookProgress?.summary ?? `${order.contentCount} ${order.contentCount === 1 ? "page" : "pages"}`}
              </span>
              <span className="block truncate text-xs text-v2-muted">
                {bookPriceLabel ?? (bookProgress ? `${bookProgress.done} of ${bookProgress.total} steps done` : null)}
              </span>
            </p>
            <button type="button" className="v2-btn-primary min-h-11 shrink-0 px-5 text-sm" onClick={openBook}>
              Continue
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
          onDrawAgain={() => makePages([editorPhoto.id], editorSource ? { source: editorSource, addVersion: true } : { addVersion: true })}
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
          onChangeShape={() => void changeShape(editorPhoto.id)}
          onToggleLeftOut={() => gen.setBookPrefs(editorPhoto.id, { leftOut: !editorPhoto.printPrefs.book?.leftOut })}
          onDelete={() => {
            closeEditor();
            deletePhoto(editorPhoto.id);
          }}
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
            // Opened from the tap itself, so the browser allows the picker. The book updates
            // as the new photo's page is made; the proof then asks only about what changed.
            setConfirm(null);
            if (!desktop) setBookOpen(false);
            fileRef.current?.click();
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
          shortfallFor="these pages"
        />
      ) : null}
      {sheetCredits.addCreditModal}
      {guestLimit ? (
        <V2GuestLimitModal scope={guestLimit.scope} kind={guestLimit.kind} onClose={() => setGuestLimit(null)} />
      ) : null}
      {deletion.modal}
    </V2StudioFrame>
  );
}
