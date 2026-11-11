"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronLeft,
  FlipHorizontal2,
  Loader2,
  PencilLine,
  Printer,
  RectangleVertical,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2GuestLimitModal } from "@/components/v2/auth/V2GuestLimitModal";
import { guestLimitScope, type GuestLimitScope } from "@/lib/guestLimit";
import {
  V2AssetLightbox,
  type LightboxFocus,
  type LightboxViewMode,
} from "@/components/v2/V2AssetLightbox";
import { V2PrintSheetModal } from "@/components/v2/V2PrintSheetModal";
import { V2SharePageModal } from "@/components/v2/share/V2SharePageModal";
import { V2SheetRevisionStrip } from "@/components/v2/V2SheetRevisionStrip";
import { V2LibraryWorkspace } from "@/components/v2/library/V2LibraryWorkspace";
import { useV2LibraryDeletion } from "@/components/v2/library/useV2LibraryDeletion";
import { useV2PhotoIngest } from "@/components/v2/library/useV2PhotoIngest";
import { useV2PhotoTransforms } from "@/components/v2/library/useV2PhotoTransforms";
import { V2LibraryRefreshButton } from "@/components/v2/library/V2LibraryRefreshButton";
import { V2StudioLayoutToggle } from "@/components/v2/V2StudioLayoutToggle";
import {
  V2SheetEditChat,
  type SheetEditMessage,
} from "@/components/v2/V2SheetEditChat";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2WelcomeGuide } from "@/components/v2/onboarding/V2WelcomeGuide";
import { readPagesMade, trackPageGenerated } from "@/lib/track";
import { V2BookNudge } from "@/components/v2/marketing/V2BookNudge";
import { V2SavePromptCard } from "@/components/v2/marketing/V2SavePromptCard";
import { V2BookUpsellCard } from "@/components/v2/marketing/V2BookUpsellCard";
import { INTENT_ALBUM_NAME, STUDIO_EMPTY } from "@/content/marketing";
import { readIntent } from "@/lib/marketing/copy";
import { authedFetch, hasSessionToken } from "@/lib/api/client";
import { friendlyRequestError } from "@/lib/api/networkError";
import {
  entryFromLibraryPhoto,
  uploadRevisionToLibrary,
} from "@/lib/v2/cloudLibrary";
import type { LibraryPhoto } from "@/lib/library/types";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useSheetUsageCredits } from "@/components/v2/credits/useSheetUsageCredits";
import { V2SheetGeneratingPlaceholder } from "@/components/v2/V2SheetGeneratingPlaceholder";
import { V2StudioPhotoGrid } from "@/components/v2/V2StudioPhotoGrid";
import { Columns2, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";
import { unitPriceCents } from "@/lib/credits/pricing";
import { usePriceList } from "@/lib/pricing/usePriceList";
import { prepareSheetDataUrlForApi } from "@/lib/photo/compressImageDataUrl";
import { PHOTO_MAX_CORRECTION_CHARS } from "@/lib/session/photoTypes";
import { compositeSheetOverlayDataUrl } from "@/lib/photo/compositeSheetOverlay";
import type { GeneratedSheet, SheetVersion } from "@/lib/session/types";
import {
  type V2PhotoEntry,
  activeSheetVersion,
  activeSourceVersion,
  activeVersionPrintPrefs,
  normalizeV2SheetRevisions,
  photoOrientation,
  photoPrintPrefs,
} from "@/lib/v2/studioTypes";

function newId() {
  return crypto.randomUUID();
}

function createSheetRevision(sheet: GeneratedSheet): SheetVersion {
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    sheet,
  };
}

type GenerateResult = "success" | "failed" | "skipped";

/** Names the studio gives a new album before anyone has renamed it. */
const PLACEHOLDER_ALBUM_NAME = /^(Untitled album|My first album|(Project|Album) \d+)$/;
const INTENT_NAMED_KEY = "cm_intent_named";

export function ColorfulMemoriesApp() {
  const toast = useV2Toast();
  const welcomeGuide = useV2WelcomeGuide();
  const router = useRouter();
  const sheetCredits = useSheetUsageCredits("/studio");
  const prices = usePriceList();
  const {
    hydrated,
    cloud,
    activeProjectId,
    activeProject,
    projects,
    renameActiveProject,
    photos,
    photosRef,
    pendingUploads,
    selectedId,
    setSelectedId,
    studioLayout,
    setStudioLayout,
    replacePhotos,
    mutatePhotos,
    updatePhoto,
  } = useV2Studio();
  /** Coloring pages in this album: the guest "Save this page" card and the book nudge read it. */
  const sheetCount = photos.filter((p) => p.sheet).length;
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
  const deletion = useV2LibraryDeletion();
  const ingestFiles = useV2PhotoIngest({ onAdded: autoGenerateFirstPage });
  const [printOpen, setPrintOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const generateAllRunRef = useRef(false);
  const coloringApiLockRef = useRef(false);
  const generateRequestIdRef = useRef<Map<string, string>>(new Map());
  /** Set once the first-page shortcut has fired, so it can never run twice. */
  const autoFirstPageRef = useRef(false);
  const photoTransforms = useV2PhotoTransforms({ sheetCredits, lockRef: coloringApiLockRef });
  const [lightboxFocus, setLightboxFocus] = useState<LightboxFocus | null>(
    null,
  );
  const [lightboxViewMode, setLightboxViewMode] =
    useState<LightboxViewMode>("single");
  const [savingOverlayRevision, setSavingOverlayRevision] = useState(false);
  /** A guest ran into the daily limit; the modal offers a free account. */
  const [guestLimit, setGuestLimit] = useState<{ scope: GuestLimitScope; kind: "page" | "edit" } | null>(null);
  const [editChatOpen, setEditChatOpen] = useState(false);
  const [editMessages, setEditMessages] = useState<SheetEditMessage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Below lg the studio is a full-screen view opened by tapping a photo. */
  /**
   * After a reload our history entry is still there (marked in history.state), so the phone studio view
   * reopens with it; Back then closes the view instead of doing nothing.
   */
  const [restoredStudioView] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.history.state as { cmStudioView?: boolean } | null)?.cmStudioView === true &&
      !window.matchMedia("(min-width: 1024px)").matches,
  );
  const [mobileStudioOpen, setMobileStudioOpen] = useState(restoredStudioView);
  /** Studio shows every photo as a sortable grid instead of the photo/sheet panes. */
  const [gridView, setGridView] = useState(false);
  /** Set while the rail's "Original" entry is selected; see originalViewKey. */
  const [originalViewFor, setOriginalViewFor] = useState<string | null>(null);

  const selected = photos.find((p) => p.id === selectedId) ?? null;
  const selectedRevisions = selected ? normalizeV2SheetRevisions(selected) : [];
  const selectedVersions = selected ? { ...selected, sheetRevisions: selectedRevisions } : null;
  const storedActiveVersion = selectedVersions ? activeSheetVersion(selectedVersions) : null;
  // Looking at the uploaded photo again lasts until the photo or its versions change.
  const originalViewKey = selected
    ? `${selected.id}:${storedActiveVersion?.id ?? ""}:${selectedRevisions.length}`
    : null;
  const viewingOriginal = originalViewKey !== null && originalViewFor === originalViewKey;
  /** Null while the uploaded photo is on show from the rail's "Original" entry. */
  const activeVersion = viewingOriginal ? null : storedActiveVersion;
  /** The portrait version on show, or the one the sheet on show was drawn from. */
  const sourceVersion =
    selectedVersions && !viewingOriginal ? activeSourceVersion(selectedVersions) : null;
  /** Once a photo has portrait versions, the rail lists the uploaded photo too so it can be recalled. */
  const railOriginal =
    selected && selectedRevisions.some((revision) => revision.kind === "photo")
      ? {
          src: selected.previewUrl,
          thumbSrc: selected.thumbUrl,
          selected: viewingOriginal,
          onSelect: () => setOriginalViewFor(originalViewKey),
        }
      : undefined;
  const sourcePhotoSrc = sourceVersion?.sheet.imageDataUrl ?? selected?.previewUrl ?? "";
  /** Null while a photo (the upload or a portrait version) is on show rather than a sheet. */
  const activeSheet =
    viewingOriginal || activeVersion?.kind === "photo" ? null : selected?.sheet ?? null;

  /**
   * On phones the studio view is a full-screen layer, so the browser Back button should close it
   * rather than leave the page. Opening pushes one history entry; Back (popstate) closes the view,
   * and the on-screen arrow goes back through history so no stray entry is left. Desktop shows the
   * studio all the time and never pushes.
   */
  const studioHistoryRef = useRef(restoredStudioView);

  function openMobileStudio() {
    setMobileStudioOpen(true);
    if (studioHistoryRef.current || window.matchMedia("(min-width: 1024px)").matches) return;
    studioHistoryRef.current = true;
    window.history.pushState({ cmStudioView: true }, "", window.location.href);
  }

  function closeMobileStudio() {
    if (studioHistoryRef.current) {
      window.history.back(); // the popstate listener closes the view
    } else {
      setMobileStudioOpen(false);
    }
  }

  useEffect(() => {
    const onPop = () => {
      studioHistoryRef.current = false;
      setMobileStudioOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function openPhoto(id: string) {
    setSelectedId(id);
    openMobileStudio();
  }

  useEffect(() => {
    setLightboxFocus(null);
    setLightboxViewMode("single");
    setEditChatOpen(false);
    setShareOpen(false);
    setEditMessages([]);
  }, [selectedId]);

  function openLightbox(focus: LightboxFocus) {
    setLightboxViewMode("single");
    setLightboxFocus(focus);
  }

  function closeLightbox() {
    setLightboxFocus(null);
    setLightboxViewMode("single");
  }

  function deleteSelectedPageFromStudio() {
    if (!selectedId) return;
    deletion.request([selectedId]);
  }

  async function generateForPhoto(
    photoId: string,
    options?: {
      select?: boolean;
      batch?: boolean;
      /** Draw from this portrait version instead of the uploaded photo. */
      source?: SheetVersion;
      /** Draw from the uploaded photo even though the photo already has versions. */
      addVersion?: boolean;
    },
  ): Promise<GenerateResult> {
    const photo = photosRef.current.find((entry) => entry.id === photoId);
    const source = options?.source ?? null;
    if (!photo || (photo.sheet && !source && !options?.addVersion)) return "skipped";
    if (photo.generating || coloringApiLockRef.current) return "skipped";

    if (options?.select !== false) {
      setSelectedId(photoId);
    }
    if (!sheetCredits.canAfford("generation", photo)) return "failed";

    coloringApiLockRef.current = true;
    const requestId = crypto.randomUUID();
    generateRequestIdRef.current.set(photoId, requestId);
    mutatePhotos((prev) =>
      prev.map((entry) =>
        entry.id === photoId ? { ...entry, generating: true } : entry,
      ),
    );

    try {
      const response = await authedFetch("/api/photo-coloring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          photo.remote
            ? {
                mode: "generate-library",
                photoId: photo.remote.photoId,
                ...(source ? { sourceRevisionId: source.id } : {}),
              }
            : source
              ? {
                  mode: "generate",
                  photoDataUrl: source.sheet.imageDataUrl,
                  printPrefs: { ...photo.printPrefs, orientation: source.orientation ?? "portrait" },
                }
              : {
                  mode: "generate",
                  photoDataUrl: photo.photoDataUrl,
                  printPrefs: photoPrintPrefs(photo),
                  image: photo.image,
                },
        ),
      }, { withAuth: Boolean(photo.remote) });
      const rawBody = await response.text();
      let payload: {
        sheet?: GeneratedSheet;
        photo?: LibraryPhoto;
        error?: string;
        code?: string;
        creditsBalanceCents?: number;
      };
      try {
        payload = JSON.parse(rawBody) as typeof payload;
      } catch {
        throw new Error(
          "The server sent an unexpected response. Please try again in a moment.",
        );
      }
      if (generateRequestIdRef.current.get(photoId) !== requestId) {
        return "skipped";
      }
      const limit = guestLimitScope(response.status, payload.code);
      if (limit) {
        setGuestLimit({ scope: limit, kind: "page" });
        mutatePhotos((prev) =>
          prev.map((entry) => (entry.id === photoId ? { ...entry, generating: false } : entry)),
        );
        return "failed";
      }
      if (sheetCredits.applyResponse(response.status, payload, "generation")) {
        mutatePhotos((prev) =>
          prev.map((entry) =>
            entry.id === photoId ? { ...entry, generating: false } : entry,
          ),
        );
        return "failed";
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not make a coloring page.");
      }
      if (payload.photo) {
        const fresh = await entryFromLibraryPhoto(payload.photo);
        mutatePhotos((prev) => prev.map((entry) => (entry.id === photoId ? fresh : entry)));
      } else {
        if (!payload.sheet) {
          throw new Error("No coloring page came back.");
        }
        const revision: SheetVersion = {
          ...createSheetRevision(payload.sheet),
          ...(source ? { orientation: source.orientation ?? "portrait", sourceRevisionId: source.id } : {}),
        };
        mutatePhotos((prev) =>
          prev.map((entry) =>
            entry.id === photoId
              ? {
                  ...entry,
                  sheet: payload.sheet!,
                  sheetRevisions: [...normalizeV2SheetRevisions(entry), revision],
                  activeRevisionId: revision.id,
                  generating: false,
                }
              : entry,
          ),
        );
      }
      trackPageGenerated(Boolean(photo.remote));
      if (!options?.batch) {
        toast.success({
          title: "Coloring page ready!",
          message:
            "Your photo has been converted to a high-quality coloring page.",
        });
      }
      return "success";
    } catch (err) {
      if (generateRequestIdRef.current.get(photoId) === requestId) {
        mutatePhotos((prev) =>
          prev.map((entry) =>
            entry.id === photoId ? { ...entry, generating: false } : entry,
          ),
        );
      }
      toast.error(friendlyRequestError(err, "Something went wrong."));
      return "failed";
    } finally {
      coloringApiLockRef.current = false;
      if (generateRequestIdRef.current.get(photoId) === requestId) {
        generateRequestIdRef.current.delete(photoId);
      }
    }
  }

  /**
   * A guest who has never made a page gets their first one without hunting for the "Generate
   * sheet" tile: the first photo of the batch is selected and drawn straight away, and on phones
   * the studio opens so they watch it happen. Guests only, because generating spends a signed-in
   * person's credit. Failures take the usual path (toast, then the retry button in the studio).
   */
  function autoGenerateFirstPage(added: V2PhotoEntry[]) {
    const first = added[0];
    if (!first || autoFirstPageRef.current) return;
    if (cloud || hasSessionToken() || readPagesMade() > 0) return;
    if (generateAllRunRef.current || coloringApiLockRef.current) return;
    if (photosRef.current.some((entry) => entry.generating || entry.correcting)) return;
    autoFirstPageRef.current = true;
    openMobileStudio();
    void generateForPhoto(first.id, { select: true });
  }

  function clearAllGeneratingFlags() {
    mutatePhotos((prev) =>
      prev.map((entry) =>
        entry.generating || entry.correcting
          ? { ...entry, generating: false, correcting: false }
          : entry,
      ),
    );
  }

  async function generateForSelected() {
    if (!selected) {
      toast.error("Upload and select a photo first.");
      return;
    }
    if (viewingOriginal) {
      await generateForPhoto(selected.id, { addVersion: true });
      return;
    }
    await generateForPhoto(selected.id, activeVersion?.kind === "photo" ? { source: activeVersion } : undefined);
  }

  function openSheetEditChat() {
    if (!activeSheet) {
      toast.error("Make a coloring page before making edits.");
      return;
    }
    setEditMessages((current) =>
      current.length > 0
        ? current
        : [
            {
              id: newId(),
              role: "assistant",
              text: "Tell me what to adjust on this page. I'll change only what you describe.",
            },
          ],
    );
    setEditChatOpen(true);
  }

  async function applySheetEdit(note: string) {
    const photo = selected;
    if (!photo?.sheet || !activeSheet) return;
    // New versions of a sheet keep its shape and the photo version it was drawn from.
    const lineage = {
      ...(activeVersion?.orientation ? { orientation: activeVersion.orientation } : {}),
      ...(activeVersion?.sourceRevisionId ? { sourceRevisionId: activeVersion.sourceRevisionId } : {}),
    };

    const trimmed = note.trim();
    if (!trimmed) return;
    if (trimmed.length > PHOTO_MAX_CORRECTION_CHARS) {
      toast.error(
        `Keep each edit note under ${PHOTO_MAX_CORRECTION_CHARS} characters.`,
      );
      return;
    }
    if (coloringApiLockRef.current || photo.generating || photo.correcting) {
      return;
    }
    if (!sheetCredits.canAfford("edit", photo)) return;

    const userMessageId = newId();
    const pendingId = newId();

    setEditMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user", text: trimmed },
      {
        id: pendingId,
        role: "assistant",
        text: "Applying your change to the page…",
        pending: true,
      },
    ]);
    coloringApiLockRef.current = true;
    updatePhoto(photo.id, { correcting: true });
    let outOfCredit = false;

    try {
      let body: Record<string, unknown>;
      if (photo.remote) {
        const revisions = normalizeV2SheetRevisions(photo);
        const revisionId = photo.activeRevisionId ?? revisions[revisions.length - 1]?.id;
        if (!revisionId) throw new Error("No page to edit yet.");
        body = { mode: "correct-library", photoId: photo.remote.photoId, revisionId, corrections: [trimmed] };
      } else {
        const sheetDataUrl = await prepareSheetDataUrlForApi(photo.sheet.imageDataUrl, 2);
        body = {
          mode: "correct",
          photoDataUrl: sourceVersion?.sheet.imageDataUrl ?? photo.photoDataUrl,
          sheetDataUrl,
          corrections: [trimmed],
          printPrefs: activeVersionPrintPrefs(photo),
          image: sourceVersion ? undefined : photo.image,
        };
      }
      const response = await authedFetch("/api/photo-coloring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, { withAuth: Boolean(photo.remote) });
      const payload = (await response.json()) as {
        sheet?: GeneratedSheet;
        photo?: LibraryPhoto;
        error?: string;
        code?: string;
        creditsBalanceCents?: number;
      };
      const limit = guestLimitScope(response.status, payload.code);
      if (limit) {
        outOfCredit = true; // the modal explains; no extra toast
        setGuestLimit({ scope: limit, kind: "edit" });
      } else {
        outOfCredit = sheetCredits.applyResponse(response.status, payload, "edit");
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not apply that edit.");
      }

      if (payload.photo) {
        const fresh = await entryFromLibraryPhoto(payload.photo);
        updatePhoto(photo.id, { ...fresh, correcting: false }, { persist: false });
      } else {
        if (!payload.sheet) {
          throw new Error("No updated page came back.");
        }
        const prior = photosRef.current.find((entry) => entry.id === photo.id);
        const revisions = prior ? [...normalizeV2SheetRevisions(prior)] : [];
        const revision = { ...createSheetRevision(payload.sheet), ...lineage };
        revisions.push(revision);
        updatePhoto(photo.id, {
          sheet: payload.sheet,
          sheetRevisions: revisions,
          activeRevisionId: revision.id,
          correcting: false,
        });
      }
      setEditMessages((prev) =>
        prev.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                pending: false,
                done: true,
                text: "Updated! Check the coloring page preview for your change.",
              }
            : message,
        ),
      );
    } catch (err) {
      updatePhoto(photo.id, { correcting: false });
      const message = friendlyRequestError(err, "Could not apply that edit.");
      if (!outOfCredit) toast.error(message);
      setEditMessages((prev) =>
        prev.map((entry) =>
          entry.id === pendingId
            ? {
                ...entry,
                pending: false,
                text: message,
              }
            : entry,
        ),
      );
    } finally {
      coloringApiLockRef.current = false;
    }
  }

  async function saveOverlaySheetRevision(opacityPercent: number) {
    const photo = selected;
    if (!photo?.sheet || !activeSheet || savingOverlayRevision) return;
    const lineage = {
      ...(activeVersion?.orientation ? { orientation: activeVersion.orientation } : {}),
      ...(activeVersion?.sourceRevisionId ? { sourceRevisionId: activeVersion.sourceRevisionId } : {}),
    };

    setSavingOverlayRevision(true);
    try {
      const imageDataUrl = await compositeSheetOverlayDataUrl(
        sourceVersion?.sheet.imageDataUrl ?? (photo.photoDataUrl || photo.previewUrl),
        photo.sheet.imageDataUrl,
        opacityPercent,
      );
      const tintedSheet: GeneratedSheet = {
        title: `${photo.sheet.title} · ${opacityPercent}% tint`,
        imageDataUrl,
        mimeType: "image/png",
      };
      if (photo.remote) {
        const stored = await uploadRevisionToLibrary({
          photoId: photo.remote.photoId,
          sheet: tintedSheet,
          meta: lineage,
        });
        const fresh = await entryFromLibraryPhoto(stored);
        updatePhoto(photo.id, fresh, { persist: false });
        toast.success({
          title: "Revision saved",
          message: `Added a ${opacityPercent}% color overlay to your page history.`,
        });
        return;
      }
      const prior = photosRef.current.find((entry) => entry.id === photo.id);
      const revisions = prior ? [...normalizeV2SheetRevisions(prior)] : [];
      const revision = { ...createSheetRevision(tintedSheet), ...lineage };
      revisions.push(revision);
      updatePhoto(photo.id, {
        sheet: tintedSheet,
        sheetRevisions: revisions,
        activeRevisionId: revision.id,
      });
      toast.success({
        title: "Revision saved",
        message: `Added a ${opacityPercent}% color overlay to your page history.`,
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not save overlay revision.",
      );
    } finally {
      setSavingOverlayRevision(false);
    }
  }

  function selectSheetRevision(photoId: string, revisionId: string) {
    const entry = photosRef.current.find((item) => item.id === photoId);
    if (!entry) return;
    const revisions = normalizeV2SheetRevisions(entry);
    const picked = revisions.find((item) => item.id === revisionId);
    if (!picked) return;
    setOriginalViewFor(null);
    updatePhoto(photoId, { sheetRevisions: revisions, activeRevisionId: revisionId, sheet: picked.sheet });
  }

  async function generateAllSheets() {
    if (generateAllRunRef.current) return;

    const queue = photosRef.current
      .filter((entry) => !entry.sheet && !entry.generating)
      .map((entry) => entry.id);

    if (queue.length === 0) {
      if (photosRef.current.length === 0) {
        toast.error("Upload photos first.");
      }
      return;
    }

    generateAllRunRef.current = true;
    setGeneratingAll(true);

    try {
      for (const photoId of queue) {
        if (!generateAllRunRef.current) break;

        const current = photosRef.current.find((entry) => entry.id === photoId);
        if (!current || current.sheet) continue;

        const result = await generateForPhoto(photoId, {
          select: false,
          batch: true,
        });
        if (result === "failed") break;
      }
    } finally {
      generateAllRunRef.current = false;
      setGeneratingAll(false);
      clearAllGeneratingFlags();
      coloringApiLockRef.current = false;
    }
  }

  /** The print-ready PDF for the sheet on screen. */
  async function makeSelectedPdf(): Promise<Blob> {
    if (!selected?.sheet || !activeSheet) throw new Error("Pick a coloring page first.");
    const response = await authedFetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        selected.remote
          ? { revisionId: activeVersion?.id, printPrefs: activeVersionPrintPrefs(selected) }
          : { imageDataUrl: selected.sheet.imageDataUrl, printPrefs: activeVersionPrintPrefs(selected) },
      ),
    }, { withAuth: Boolean(selected.remote) });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Could not make a PDF.");
    }
    return response.blob();
  }

  const anyGenerating = photos.some(
    (entry) => entry.generating || entry.correcting,
  );
  const busy =
    (selected?.generating ?? false) ||
    (selected?.correcting ?? false) ||
    generatingAll;
  const mirroring = Boolean(selected) && photoTransforms.mirroringId === selected?.id;
  const makingPortrait = Boolean(selected) && photoTransforms.portraitId === selected?.id;
  const portraitCents = unitPriceCents(prices, "ai.photo_portrait");
  const photoToolsDisabled =
    busy || anyGenerating || photoTransforms.mirroringId !== null || photoTransforms.portraitId !== null;
  const sheetBusy = (selected?.generating ?? false) && !activeSheet;
  const sheetCorrecting = selected?.correcting ?? false;
  const sheetReady = Boolean(activeSheet);
  /** Signed-in pages saved to the library can get a share link; guest pages never leave the device. */
  const shareRevisionId =
    cloud && selected?.remote && selected.canDelete !== false && activeSheet ? activeVersion?.id ?? null : null;
  const hasAnySheet = photos.some((entry) => entry.sheet);
  const needsSheetCount = photos.filter((entry) => !entry.sheet).length;
  const uploading = pendingUploads.length > 0;
  const canGenerateAll =
    needsSheetCount > 0 && !uploading && !generatingAll && !anyGenerating;
  const canBuyBook =
    hasAnySheet && !uploading && !generatingAll && !anyGenerating && !busy;

  function buyBook() {
    if (!hasAnySheet) {
      toast.error(
        "Make at least one coloring page before creating your book.",
      );
      return;
    }
    const storeUrl = process.env.NEXT_PUBLIC_BOOK_STORE_URL?.trim();
    if (storeUrl) {
      window.open(storeUrl, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(
      activeProjectId ? `/studio/order?project=${encodeURIComponent(activeProjectId)}` : "/studio/order",
    );
  }

  const showRevisionSidebar =
    Boolean(selected?.sheet) && selectedRevisions.length > 0;
  const showPhotoPane = studioLayout === "photo" || studioLayout === "both";
  const showSheetPane = studioLayout === "sheet" || studioLayout === "both";
  const activeRevisionId = activeVersion?.id ?? null;

  if (!hydrated) {
    return (
      <V2StudioFrame>
        <div className="flex flex-1 items-center justify-center pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <p className="flex items-center gap-2 text-sm text-v2-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Restoring your studio…
          </p>
        </div>
      </V2StudioFrame>
    );
  }

  const studioOpen = mobileStudioOpen && Boolean(selected);

  // Under a finished page only: not while it draws, edits or is missing.
  const bookCard =
    sheetReady && !busy ? (
      <V2BookUpsellCard
        pageCount={sheetCount}
        canMakeBook={canBuyBook}
        onMakeBook={buyBook}
        onAddPhotos={() => fileRef.current?.click()}
        className={cloud ? "lg:hidden" : undefined}
      />
    ) : null;

  const refreshButton = (
    <V2LibraryRefreshButton disabled={uploading || generatingAll || anyGenerating} />
  );

  // Guests have nothing to refresh from, so they keep the batch generate shortcut.
  const generateAllButton = cloud ? (
    refreshButton
  ) : photos.length > 0 ? (
      <button
        type="button"
        disabled={!canGenerateAll}
        onClick={() => void generateAllSheets()}
        className="v2-hit inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-v2-primary/30 bg-v2-primary-light px-3.5 text-sm font-semibold text-v2-link transition hover:border-v2-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generatingAll ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden />
        )}
        Make all pages
        {needsSheetCount > 0 && !generatingAll ? (
          <span className="rounded-full bg-v2-primary/15 px-1.5 text-xs font-bold tabular-nums">
            {needsSheetCount}
          </span>
        ) : null}
      </button>
    ) : null;

  const photoPane = (
    <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && openLightbox("original")}
        className={cn(
          "flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-xl bg-v2-bg-subtle",
          selected &&
            "cursor-zoom-in transition hover:ring-2 hover:ring-v2-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary",
          !selected && "cursor-default",
        )}
        aria-label={selected ? "View original photo full screen" : undefined}
      >
        {selected ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sourcePhotoSrc}
            alt="Selected photo"
            className="pointer-events-none max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="p-6 text-center text-sm text-v2-muted">
            Select a photo to preview
          </span>
        )}
      </button>
      {selected ? (
        <div className="absolute right-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap justify-end gap-1.5">
          <button
            type="button"
            disabled={photoToolsDisabled}
            onClick={() => void photoTransforms.mirrorPhoto(selected.id)}
            className="v2-photo-tool"
            title={
              selectedRevisions.length > 0
                ? "Flip this photo and all its versions left to right"
                : "Flip this photo left to right"
            }
          >
            {mirroring ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <FlipHorizontal2 className="h-4 w-4 shrink-0" aria-hidden />
            )}
            Mirror
          </button>
          {photoOrientation(selected) === "landscape" ? (
            <button
              type="button"
              disabled={photoToolsDisabled}
              onClick={() => void photoTransforms.makePortrait(selected.id)}
              className="v2-photo-tool v2-photo-tool--ai"
              title={
                selected.remote && portraitCents != null
                  ? `Add an AI portrait version of this photo (${formatCredits(portraitCents)})`
                  : "Add an AI portrait version of this photo"
              }
            >
              <RectangleVertical className="h-4 w-4 shrink-0" aria-hidden />
              Make portrait
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
      {makingPortrait ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/75 p-4 text-center backdrop-blur-[1px]"
          aria-busy="true"
        >
          <Loader2 className="h-8 w-8 animate-spin text-v2-primary" />
          <span className="text-sm font-medium text-v2-navy">
            Making a portrait version…
          </span>
        </div>
      ) : null}
    </div>
  );

  const sheetPane = (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      {activeSheet ? (
        <div className="relative flex min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-v2-bg-subtle">
          <button
            type="button"
            disabled={sheetCorrecting}
            onClick={() => openLightbox("sheet")}
            className="relative flex h-full min-h-0 w-full flex-1 cursor-zoom-in items-center justify-center transition hover:ring-2 hover:ring-v2-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary disabled:cursor-wait"
            aria-label="View coloring page full screen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeSheet.imageDataUrl}
              alt="Generated coloring page"
              className="pointer-events-none max-h-full max-w-full object-contain"
            />
          </button>
          {sheetCorrecting ? (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/75 p-4 text-center backdrop-blur-[1px]"
              aria-busy="true"
            >
              <Loader2 className="h-8 w-8 animate-spin text-v2-primary" />
              <span className="text-sm font-medium text-v2-navy">
                Applying your edits…
              </span>
            </div>
          ) : null}
        </div>
      ) : sheetBusy && selected ? (
        <V2SheetGeneratingPlaceholder
          imageSrc={sourcePhotoSrc}
          imageAlt="Photo being traced"
          className="min-h-0 w-full flex-1 rounded-xl border border-gray-200"
          imageFit="contain"
        />
      ) : (
        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-v2-primary/30 bg-v2-primary-light/60 p-6 text-center">
          <p className="max-w-xs text-sm text-v2-muted">
            {!selected
              ? "Select a photo from your library to get started."
              : viewingOriginal
                ? "This is your original photo. Make a coloring page from it, or pick a version."
                : activeVersion?.kind === "photo"
                  ? "This portrait version doesn’t have a coloring page yet."
                : "This photo doesn’t have a coloring page yet."}
          </p>
          <button
            type="button"
            disabled={!selected || generatingAll}
            onClick={() => void generateForSelected()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-v2-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-v2-primary/20 transition hover:bg-v2-primary-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            Make coloring page
          </button>
        </div>
      )}
    </div>
  );

  return (
    <V2StudioFrame pageScroll>
      {/* Phones: nothing here clips or scrolls — the frame scrolls the whole page. */}
      <V2LibraryWorkspace
        emptyState={{ onHowItWorks: welcomeGuide.open, line: STUDIO_EMPTY.lineByIntent[readIntent()] }}
        fileInputRef={fileRef}
        onFiles={(files) => void ingestFiles(files)}
        onSelectPhoto={openPhoto}
        onGenerateSheet={(id) => {
          if (generatingAll || coloringApiLockRef.current) return;
          void generateForPhoto(id);
        }}
        generateDisabled={generatingAll || anyGenerating}
        deletion={deletion}
        deleteDisabled={uploading || generatingAll}
        headerAction={generateAllButton}
        dock={
          cloud && sheetCount > 0 ? (
            <V2BookNudge pageCount={sheetCount} disabled={!canBuyBook} onMakeBook={buyBook} />
          ) : (
            <button
              type="button"
              disabled={!canBuyBook}
              onClick={buyBook}
              className="v2-photo-list-dock-cta"
            >
              <BookOpen className="h-5 w-5 shrink-0" aria-hidden />
              Make a book
            </button>
          )
        }
        studioActions={
          <>
            <button
              type="button"
              disabled={!sheetReady || busy}
              onClick={() => setPrintOpen(true)}
              className="v2-studio-toolbar-btn"
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden />
              Print page
            </button>
            {shareRevisionId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setShareOpen(true)}
                className="v2-studio-toolbar-btn"
              >
                <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                Share
              </button>
            ) : null}
            <button
              type="button"
              disabled={!sheetReady || busy}
              onClick={openSheetEditChat}
              className="v2-studio-toolbar-btn v2-studio-toolbar-btn--primary"
            >
              <PencilLine className="h-4 w-4 shrink-0" aria-hidden />
              Edit page
            </button>
            {selected ? (
              <button
                type="button"
                onClick={deleteSelectedPageFromStudio}
                disabled={busy || deletion.active}
                className="v2-studio-toolbar-btn v2-studio-toolbar-btn--danger"
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                Delete photo
              </button>
            ) : null}
          </>
        }
      >
          {/* Studio — right column on desktop, full-screen view on phones */}
          <main
            className={cn(
              "flex-col bg-v2-bg",
              studioOpen ? "v2-safe-overlay fixed inset-0 z-[45] flex" : "hidden",
              "lg:static lg:z-auto lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:overflow-hidden lg:p-4 xl:p-6",
            )}
            aria-label="Studio"
          >
            <section className="v2-panel flex min-h-0 flex-1 overflow-hidden rounded-none border-0 shadow-none lg:rounded-2xl lg:border lg:shadow-[0_1px_2px_rgb(10_16_26/0.04),0_8px_24px_rgb(10_16_26/0.05)]">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <header className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2 sm:px-5 lg:px-6 lg:py-3">
                  <button
                    type="button"
                    onClick={closeMobileStudio}
                    className="-ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle lg:hidden"
                    aria-label="Back to photos"
                  >
                    <ChevronLeft className="h-6 w-6" aria-hidden />
                  </button>
                  <h2 className="flex h-9 min-w-0 items-center truncate text-base font-semibold tracking-tight text-v2-ink lg:text-lg">
                    Studio
                  </h2>
                  {/* sheet view ⇄ grid view */}
                  <div
                    className="ml-2 inline-flex h-9 shrink-0 items-center gap-1.5 sm:ml-3"
                    role="group"
                    aria-label="Studio view"
                  >
                    <Columns2
                      className={cn("h-4 w-4", gridView ? "text-v2-muted" : "text-v2-primary")}
                      aria-hidden
                    />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={gridView}
                      aria-label={gridView ? "Showing all photos as a grid" : "Showing the selected photo and page"}
                      title={gridView ? "Switch to page view" : "Switch to grid view"}
                      onClick={() => setGridView((v) => !v)}
                      className={cn(
                        "v2-hit relative inline-flex h-6 w-10 items-center rounded-full border transition-colors",
                        gridView ? "border-v2-primary bg-v2-primary" : "border-v2-primary/40 bg-v2-primary-light",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform",
                          gridView ? "translate-x-[18px]" : "translate-x-0.5",
                        )}
                      />
                    </button>
                    <LayoutGrid
                      className={cn("h-4 w-4", gridView ? "text-v2-primary" : "text-v2-muted")}
                      aria-hidden
                    />
                  </div>
                  <span className="flex-1" aria-hidden />
                  <V2StudioLayoutToggle
                    className={cn("h-9 shrink-0", gridView && "opacity-50")}
                    value={studioLayout}
                    onChange={(mode) => {
                      setGridView(false);
                      setStudioLayout(mode);
                    }}
                  />
                </header>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-5 lg:p-6">
                  {gridView ? (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
                      <V2StudioPhotoGrid
                        photos={photos}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onReorder={replacePhotos}
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "grid min-h-0 flex-1 gap-3 overflow-hidden lg:gap-5",
                        studioLayout === "both"
                          ? "grid-rows-2 sm:grid-cols-2 sm:grid-rows-1"
                          : "grid-cols-1",
                      )}
                    >
                      {showPhotoPane ? photoPane : null}
                      {showSheetPane ? sheetPane : null}
                    </div>
                  )}
                </div>

                {/* One next-step card at a time: a guest's "Save this page" card while it is due,
                    otherwise "Turn this into a book". Signed-in people only get the book card, and
                    on desktop the list's own book nudge already says it, so the card hides there. */}
                {!cloud && hydrated ? <V2SavePromptCard pageCount={sheetCount} fallback={bookCard} /> : null}
                {cloud ? bookCard : null}

                {/* Phone-only: revisions + page actions */}
                {showRevisionSidebar && selected && !gridView ? (
                  <V2SheetRevisionStrip
                    variant="compact"
                    className="shrink-0 border-t border-gray-100 px-3 py-2 lg:hidden"
                    revisions={selectedRevisions}
                    activeRevisionId={activeRevisionId}
                    original={railOriginal}
                    onSelect={(revisionId) =>
                      selectSheetRevision(selected.id, revisionId)
                    }
                    disabled={sheetCorrecting}
                  />
                ) : null}
                {selected ? (
                  <footer className={`grid shrink-0 ${shareRevisionId ? "grid-cols-4" : "grid-cols-3"} gap-2 border-t border-gray-100 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:hidden`}>
                    <button
                      type="button"
                      disabled={!sheetReady || busy}
                      onClick={() => setPrintOpen(true)}
                      className="v2-studio-action"
                    >
                      <Printer className="h-5 w-5" aria-hidden />
                      Print
                    </button>
                    {shareRevisionId ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setShareOpen(true)}
                        className="v2-studio-action"
                      >
                        <Share2 className="h-5 w-5" aria-hidden />
                        Share
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={!sheetReady || busy}
                      onClick={openSheetEditChat}
                      className="v2-studio-action v2-studio-action--primary"
                    >
                      <PencilLine className="h-5 w-5" aria-hidden />
                      Edit page
                    </button>
                    <button
                      type="button"
                      disabled={busy || deletion.active}
                      onClick={deleteSelectedPageFromStudio}
                      className="v2-studio-action v2-studio-action--danger"
                    >
                      <Trash2 className="h-5 w-5" aria-hidden />
                      Delete
                    </button>
                  </footer>
                ) : null}
              </div>

              {showRevisionSidebar && selected && !gridView ? (
                <V2SheetRevisionStrip
                  variant="sidebar"
                  className="hidden min-h-0 self-stretch lg:flex"
                  revisions={selectedRevisions}
                  activeRevisionId={activeRevisionId}
                  original={railOriginal}
                  onSelect={(revisionId) =>
                    selectSheetRevision(selected.id, revisionId)
                  }
                  onEditSheet={openSheetEditChat}
                  editDisabled={busy || !sheetReady}
                  disabled={sheetCorrecting}
                />
              ) : null}
            </section>
          </main>
      </V2LibraryWorkspace>

      {selected && activeSheet ? (
        <V2SheetEditChat
          open={editChatOpen}
          onClose={() => setEditChatOpen(false)}
          originalPreviewUrl={sourcePhotoSrc}
          sheetImageUrl={activeSheet.imageDataUrl}
          messages={editMessages}
          onSend={(text) => void applySheetEdit(text)}
          busy={sheetCorrecting}
          disabled={!sheetReady}
        />
      ) : null}

      {printOpen && selected && activeSheet ? (
        <V2PrintSheetModal
          key={`${selected.id}:${activeVersion?.id ?? "sheet"}`}
          sheetSrc={activeSheet.imageDataUrl}
          printPrefs={activeVersionPrintPrefs(selected)}
          makePdf={makeSelectedPdf}
          onClose={() => setPrintOpen(false)}
        />
      ) : null}

      {shareOpen && selected?.remote && shareRevisionId && activeSheet ? (
        <V2SharePageModal
          key={`${selected.id}:${shareRevisionId}`}
          photoId={selected.remote.photoId}
          revisionId={shareRevisionId}
          sheetSrc={activeSheet.imageDataUrl}
          onClose={() => setShareOpen(false)}
        />
      ) : null}

      {lightboxFocus && selected ? (
        <V2AssetLightbox
          focus={lightboxFocus}
          originalSrc={sourcePhotoSrc}
          sheetSrc={activeSheet?.imageDataUrl ?? null}
          viewMode={lightboxViewMode}
          onViewModeChange={setLightboxViewMode}
          onClose={closeLightbox}
          onSaveOverlayRevision={saveOverlaySheetRevision}
          saveOverlayRevisionBusy={savingOverlayRevision}
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
