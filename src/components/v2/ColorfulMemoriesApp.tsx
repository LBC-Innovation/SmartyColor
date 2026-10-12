"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckSquare,
  ChevronLeft,
  CloudUpload,
  Download,
  ImageIcon,
  Loader2,
  PencilLine,
  Printer,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2ProjectSwitcher } from "@/components/v2/V2ProjectSwitcher";
import {
  V2AssetLightbox,
  type LightboxFocus,
  type LightboxViewMode,
} from "@/components/v2/V2AssetLightbox";
import { V2PhotoLibraryList } from "@/components/v2/V2PhotoLibraryList";
import { V2SheetRevisionStrip } from "@/components/v2/V2SheetRevisionStrip";
import {
  V2StudioLayoutToggle,
  type StudioLayoutMode,
} from "@/components/v2/V2StudioLayoutToggle";
import {
  V2SheetEditChat,
  type SheetEditMessage,
} from "@/components/v2/V2SheetEditChat";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { authedFetch } from "@/lib/api/client";
import {
  entryFromLibraryPhoto,
  uploadPhotoToLibrary,
  uploadRevisionToLibrary,
} from "@/lib/v2/cloudLibrary";
import type { LibraryPhoto } from "@/lib/library/types";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useSheetUsageCredits } from "@/components/v2/credits/useSheetUsageCredits";
import { V2DeletePagesConfirmModal } from "@/components/v2/V2DeletePagesConfirmModal";
import { V2SheetGeneratingPlaceholder } from "@/components/v2/V2SheetGeneratingPlaceholder";
import { V2StudioToolbar } from "@/components/v2/V2StudioToolbar";
import { V2LibraryMigrationBanner } from "@/components/v2/V2LibraryMigrationBanner";
import { V2StudioPhotoGrid } from "@/components/v2/V2StudioPhotoGrid";
import { Columns2, LayoutGrid } from "lucide-react";
import { useV2WelcomeGuide } from "@/components/v2/onboarding/V2WelcomeGuide";
import { withViewTransition } from "@/lib/v2/viewTransition";
import { V2UploadDropzone } from "@/components/v2/V2UploadDropzone";
import { cn } from "@/lib/cn";
import { prepareSheetDataUrlForApi } from "@/lib/photo/compressImageDataUrl";
import { isAllowedPhotoFile } from "@/lib/photo/heicFile";
import { inferPhotoLayout } from "@/lib/photo/orientation";
import { readBlobImageSize } from "@/lib/photo/readImageSize";
import { preparePhotoFileForApi } from "@/lib/photo/preparePhotoUpload";
import { readPhotoCapturedAt } from "@/lib/photo/readPhotoCapturedAt";
import {
  defaultPrintPrefs,
  type PrintPrefs,
} from "@/lib/print/settings";
import {
  formatPhotoSizeLimit,
  PHOTO_UPLOAD_MAX_BYTES,
} from "@/lib/photo/payloadBudget";
import { PHOTO_MAX_CORRECTION_CHARS } from "@/lib/session/photoTypes";
import { compositeSheetOverlayDataUrl } from "@/lib/photo/compositeSheetOverlay";
import type { GeneratedSheet, SheetVersion } from "@/lib/session/types";
import {
  normalizeV2SheetRevisions,
  type V2PhotoEntry,
  photoImageMeta,
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

export function ColorfulMemoriesApp() {
  const toast = useV2Toast();
  const router = useRouter();
  const welcomeGuide = useV2WelcomeGuide();
  const sheetCredits = useSheetUsageCredits("/studio");
  const {
    hydrated,
    cloud,
    refreshActiveProject,
    activeProjectId,
    photos,
    photosRef,
    pendingUploads,
    selectedId,
    setSelectedId,
    studioLayout,
    setStudioLayout,
    setPendingUploads,
    replacePhotos,
    mutatePhotos,
    updatePhoto,
    appendPhoto,
    removePhotosByIds,
    trackPreviewUrl,
  } = useV2Studio();
  const [downloading, setDownloading] = useState(false);
  const [printingBook, setPrintingBook] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const generateAllRunRef = useRef(false);
  const coloringApiLockRef = useRef(false);
  const generateRequestIdRef = useRef<Map<string, string>>(new Map());
  const [lightboxFocus, setLightboxFocus] = useState<LightboxFocus | null>(
    null,
  );
  const [lightboxViewMode, setLightboxViewMode] =
    useState<LightboxViewMode>("single");
  const [savingOverlayRevision, setSavingOverlayRevision] = useState(false);
  const [editChatOpen, setEditChatOpen] = useState(false);
  const [editMessages, setEditMessages] = useState<SheetEditMessage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [deletePagesMode, setDeletePagesMode] = useState(false);
  const [deleteSelectedIds, setDeleteSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  /** Below lg the studio is a full-screen view opened by tapping a photo. */
  const [mobileStudioOpen, setMobileStudioOpen] = useState(false);
  /** While the project name is being edited the toolbar is given over to that. */
  const [renamingProject, setRenamingProject] = useState(false);
  /** Studio shows every photo as a sortable grid instead of the photo/sheet panes. */
  const [gridView, setGridView] = useState(false);

  const selected = photos.find((p) => p.id === selectedId) ?? null;

  function openPhoto(id: string) {
    setSelectedId(id);
    setMobileStudioOpen(true);
  }

  useEffect(() => {
    setLightboxFocus(null);
    setLightboxViewMode("single");
    setEditChatOpen(false);
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

  async function ingestFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const queue: { file: File; pendingId: string }[] = [];

    for (const file of files) {
      if (!isAllowedPhotoFile(file)) {
        toast.error("Please choose photos only (JPG, PNG, WebP, or HEIC).");
        continue;
      }
      if (file.size > PHOTO_UPLOAD_MAX_BYTES) {
        toast.error(
          `"${file.name}" is too large. Try one under ${formatPhotoSizeLimit(PHOTO_UPLOAD_MAX_BYTES)}.`,
        );
        continue;
      }
      queue.push({ file, pendingId: newId() });
    }

    if (queue.length === 0) return;

    setPendingUploads((prev) => [
      ...prev,
      ...queue.map(({ pendingId }) => ({ id: pendingId })),
    ]);

    let firstAddedId: string | null = null;

    for (const { file, pendingId } of queue) {
      try {
        const prepared = await preparePhotoFileForApi(file, 2);
        const previewUrl = URL.createObjectURL(prepared.previewBlob);
        trackPreviewUrl(previewUrl);

        const size = await readBlobImageSize(prepared.previewBlob);
        const layout = inferPhotoLayout(size.width, size.height);
        const printPrefs: PrintPrefs = {
          ...defaultPrintPrefs,
          orientation: layout.orientation,
        };
        const capturedAt = await readPhotoCapturedAt(file);

        if (cloud) {
          if (!activeProjectId) throw new Error("No album selected.");
          URL.revokeObjectURL(previewUrl);
          const entry = await uploadPhotoToLibrary({
            projectId: activeProjectId,
            blob: prepared.previewBlob,
            mimeType: prepared.previewBlob.type || "image/jpeg",
            layout,
            printPrefs,
            fileName: file.name,
            capturedAt,
          });
          firstAddedId ??= entry.id;
          appendPhoto(entry);
          continue;
        }

        const entry: V2PhotoEntry = {
          id: newId(),
          previewUrl,
          photoDataUrl: prepared.photoDataUrl,
          image: photoImageMeta(layout),
          printPrefs,
          capturedAt,
          fileName: file.name,
          userCaption: "",
          chatMessages: [],
          photoSummary: null,
          crop: null,
          sheet: null,
          generating: false,
          correcting: false,
        };

        firstAddedId ??= entry.id;
        appendPhoto(entry);
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : "Could not read this photo.";
        toast.error(`Could not add "${file.name}": ${detail}`);
      } finally {
        setPendingUploads((prev) => prev.filter((item) => item.id !== pendingId));
      }
    }

    if (firstAddedId) {
      setSelectedId((current) => current ?? firstAddedId);
    }
  }

  function exitDeletePagesMode() {
    withViewTransition(() => {
      setDeletePagesMode(false);
      setDeleteSelectedIds(new Set());
    });
  }

  function toggleDeletePagesSelection(id: string) {
    setDeleteSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function requestDeletePages(ids: string[]) {
    if (ids.length === 0) return;
    setPendingDeleteIds(ids);
    setDeleteConfirmOpen(true);
  }

  function confirmPermanentDelete() {
    const locked = new Set(
      photosRef.current.filter((entry) => entry.canDelete === false).map((entry) => entry.id),
    );
    const ids = pendingDeleteIds.filter((id) => !locked.has(id));
    const skipped = pendingDeleteIds.length - ids.length;
    if (ids.length === 0) {
      setDeleteConfirmOpen(false);
      setPendingDeleteIds([]);
      if (skipped > 0) {
        toast.error("Only the person who added a photo, or the album's owner, can delete it.");
      }
      return;
    }
    removePhotosByIds(ids);
    setDeleteConfirmOpen(false);
    setPendingDeleteIds([]);
    exitDeletePagesMode();
    toast.success({
      message:
        ids.length === 1
          ? "Page permanently deleted."
          : `${ids.length} pages permanently deleted.`,
    });
    if (skipped > 0) {
      toast.info(
        skipped === 1
          ? "1 photo was added by someone else and was kept."
          : `${skipped} photos were added by other people and were kept.`,
      );
    }
  }

  function cancelPermanentDelete() {
    setDeleteConfirmOpen(false);
    setPendingDeleteIds([]);
  }

  /** Pages that can be checked for deletion (generating ones are locked). */
  const deletableIds = photos.filter((p) => !p.generating).map((p) => p.id);
  const allDeletableSelected =
    deletableIds.length > 0 && deletableIds.every((id) => deleteSelectedIds.has(id));

  function toggleSelectAllForDelete() {
    setDeleteSelectedIds(allDeletableSelected ? new Set() : new Set(deletableIds));
  }

  function openDeletePagesMode() {
    withViewTransition(() => {
      setDeleteSelectedIds(new Set());
      setDeletePagesMode(true);
    });
  }

  function submitBulkDeleteFromRail() {
    requestDeletePages([...deleteSelectedIds]);
  }

  function deleteSelectedPageFromStudio() {
    if (!selectedId) return;
    requestDeletePages([selectedId]);
  }

  async function generateForPhoto(
    photoId: string,
    options?: { select?: boolean; batch?: boolean },
  ): Promise<GenerateResult> {
    const photo = photosRef.current.find((entry) => entry.id === photoId);
    if (!photo || photo.sheet) return "skipped";
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
            ? { mode: "generate-library", photoId: photo.remote.photoId }
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
      if (sheetCredits.applyResponse(response.status, payload, "generation")) {
        mutatePhotos((prev) =>
          prev.map((entry) =>
            entry.id === photoId ? { ...entry, generating: false } : entry,
          ),
        );
        return "failed";
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not make a coloring sheet.");
      }
      if (payload.photo) {
        const fresh = await entryFromLibraryPhoto(payload.photo);
        mutatePhotos((prev) => prev.map((entry) => (entry.id === photoId ? fresh : entry)));
      } else {
        if (!payload.sheet) {
          throw new Error("No coloring sheet came back.");
        }
        const revision = createSheetRevision(payload.sheet);
        mutatePhotos((prev) =>
          prev.map((entry) =>
            entry.id === photoId
              ? {
                  ...entry,
                  sheet: payload.sheet!,
                  sheetRevisions: [revision],
                  activeRevisionId: revision.id,
                  generating: false,
                }
              : entry,
          ),
        );
      }
      if (!options?.batch) {
        toast.success({
          title: "Coloring sheet ready!",
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
      toast.error(
        err instanceof Error ? err.message : "Something went wrong.",
      );
      return "failed";
    } finally {
      coloringApiLockRef.current = false;
      if (generateRequestIdRef.current.get(photoId) === requestId) {
        generateRequestIdRef.current.delete(photoId);
      }
    }
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
    await generateForPhoto(selected.id);
  }

  function openSheetEditChat() {
    if (!selected?.sheet) {
      toast.error("Generate a coloring sheet before making edits.");
      return;
    }
    setEditMessages((current) =>
      current.length > 0
        ? current
        : [
            {
              id: newId(),
              role: "assistant",
              text: "Tell me what to adjust on this sheet. I'll change only what you describe.",
            },
          ],
    );
    setEditChatOpen(true);
  }

  async function applySheetEdit(note: string) {
    const photo = selected;
    if (!photo?.sheet) return;

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
        text: "Applying your change to the sheet…",
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
        if (!revisionId) throw new Error("No sheet to edit yet.");
        body = { mode: "correct-library", photoId: photo.remote.photoId, revisionId, corrections: [trimmed] };
      } else {
        const sheetDataUrl = await prepareSheetDataUrlForApi(photo.sheet.imageDataUrl, 2);
        body = {
          mode: "correct",
          photoDataUrl: photo.photoDataUrl,
          sheetDataUrl,
          corrections: [trimmed],
          printPrefs: photoPrintPrefs(photo),
          image: photo.image,
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
      outOfCredit = sheetCredits.applyResponse(response.status, payload, "edit");
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not apply that edit.");
      }

      if (payload.photo) {
        const fresh = await entryFromLibraryPhoto(payload.photo);
        updatePhoto(photo.id, { ...fresh, correcting: false }, { persist: false });
      } else {
        if (!payload.sheet) {
          throw new Error("No updated sheet came back.");
        }
        const prior = photosRef.current.find((entry) => entry.id === photo.id);
        const revisions = prior ? [...normalizeV2SheetRevisions(prior)] : [];
        const revision = createSheetRevision(payload.sheet);
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
                text: "Updated! Check the coloring sheet preview for your change.",
              }
            : message,
        ),
      );
    } catch (err) {
      updatePhoto(photo.id, { correcting: false });
      const message =
        err instanceof Error ? err.message : "Could not apply that edit.";
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
    if (!photo?.sheet || savingOverlayRevision) return;

    setSavingOverlayRevision(true);
    try {
      const imageDataUrl = await compositeSheetOverlayDataUrl(
        photo.photoDataUrl || photo.previewUrl,
        photo.sheet.imageDataUrl,
        opacityPercent,
      );
      const tintedSheet: GeneratedSheet = {
        title: `${photo.sheet.title} · ${opacityPercent}% tint`,
        imageDataUrl,
        mimeType: "image/png",
      };
      if (photo.remote) {
        const stored = await uploadRevisionToLibrary({ photoId: photo.remote.photoId, sheet: tintedSheet });
        const fresh = await entryFromLibraryPhoto(stored);
        updatePhoto(photo.id, fresh, { persist: false });
        toast.success({
          title: "Revision saved",
          message: `Added a ${opacityPercent}% color overlay to your sheet history.`,
        });
        return;
      }
      const prior = photosRef.current.find((entry) => entry.id === photo.id);
      const revisions = prior ? [...normalizeV2SheetRevisions(prior)] : [];
      const revision = createSheetRevision(tintedSheet);
      revisions.push(revision);
      updatePhoto(photo.id, {
        sheet: tintedSheet,
        sheetRevisions: revisions,
        activeRevisionId: revision.id,
      });
      toast.success({
        title: "Revision saved",
        message: `Added a ${opacityPercent}% color overlay to your sheet history.`,
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

  /** Cloud albums: pull in photos and sheets added from other devices or by other people. */
  async function refreshLibrary() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await refreshActiveProject();
      if (result === "gone") toast.info("That album is no longer available, so we opened another one.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh this album.");
    } finally {
      setRefreshing(false);
    }
  }

  async function downloadSelected() {
    if (!selected?.sheet) return;
    setDownloading(true);
    try {
      const response = await authedFetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selected.remote
            ? { revisionId: selected.activeRevisionId, printPrefs: photoPrintPrefs(selected) }
            : { imageDataUrl: selected.sheet.imageDataUrl, printPrefs: photoPrintPrefs(selected) },
        ),
      }, { withAuth: Boolean(selected.remote) });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not make a PDF.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "colorful-memories-coloring-sheet.pdf";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF failed.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadPrintBook() {
    const withSheets = photos.filter((entry) => entry.sheet);
    const pages = withSheets.map((entry) => ({
      imageDataUrl: entry.sheet!.imageDataUrl,
      printPrefs: photoPrintPrefs(entry),
    }));
    const revisions = withSheets
      .filter((entry) => entry.remote && entry.activeRevisionId)
      .map((entry) => ({ revisionId: entry.activeRevisionId!, printPrefs: photoPrintPrefs(entry) }));

    if (pages.length === 0) {
      toast.error(
        "Generate at least one coloring sheet to build your print book.",
      );
      return;
    }

    setPrintingBook(true);
    try {
      const response = await authedFetch("/api/pdf/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cloud ? { revisions } : { pages }),
      }, { withAuth: Boolean(cloud) });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not make the print book PDF.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "colorful-memories-print-book.pdf";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Print book failed.");
    } finally {
      setPrintingBook(false);
    }
  }

  const anyGenerating = photos.some(
    (entry) => entry.generating || entry.correcting,
  );
  const busy =
    (selected?.generating ?? false) ||
    (selected?.correcting ?? false) ||
    generatingAll;
  const sheetBusy = (selected?.generating ?? false) && !selected?.sheet;
  const sheetCorrecting = selected?.correcting ?? false;
  const sheetReady = Boolean(selected?.sheet);
  const hasAnySheet = photos.some((entry) => entry.sheet);
  const needsSheetCount = photos.filter((entry) => !entry.sheet).length;
  const uploading = pendingUploads.length > 0;
  const libraryPhotoCount = photos.length + pendingUploads.length;
  const canGenerateAll =
    needsSheetCount > 0 && !uploading && !generatingAll && !anyGenerating;
  const canBuyBook =
    hasAnySheet && !uploading && !generatingAll && !anyGenerating && !busy;

  function buyBook() {
    if (!hasAnySheet) {
      toast.error(
        "Generate at least one coloring sheet before ordering your book.",
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

  const selectedRevisions = selected ? normalizeV2SheetRevisions(selected) : [];
  const showRevisionSidebar =
    Boolean(selected?.sheet) && selectedRevisions.length > 0;
  const showPhotoPane = studioLayout === "photo" || studioLayout === "both";
  const showSheetPane = studioLayout === "sheet" || studioLayout === "both";
  const activeRevisionId =
    selected?.activeRevisionId ??
    selectedRevisions[selectedRevisions.length - 1]?.id ??
    null;

  // First visit: walk new users through the workspace.
  useEffect(() => {
    if (hydrated) welcomeGuide.openIfNotDismissed();
  }, [hydrated, welcomeGuide]);

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

  const fileInput = (
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
  );

  const refreshButton = (
    <button
      type="button"
      disabled={refreshing || uploading || generatingAll || anyGenerating}
      onClick={() => void refreshLibrary()}
      title="Check for new photos"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-v2-primary/30 bg-v2-primary-light px-3.5 text-sm font-semibold text-v2-link transition hover:border-v2-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
      Refresh
    </button>
  );

  // Guests have nothing to refresh from, so they keep the batch generate shortcut.
  const generateAllButton = cloud ? (
    refreshButton
  ) : photos.length > 0 ? (
      <button
        type="button"
        disabled={!canGenerateAll}
        onClick={() => void generateAllSheets()}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-v2-primary/30 bg-v2-primary-light px-3.5 text-sm font-semibold text-v2-link transition hover:border-v2-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generatingAll ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden />
        )}
        Generate all
        {needsSheetCount > 0 && !generatingAll ? (
          <span className="rounded-full bg-v2-primary/15 px-1.5 text-xs font-bold tabular-nums">
            {needsSheetCount}
          </span>
        ) : null}
      </button>
    ) : null;

  const photoPane = (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
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
            src={selected.previewUrl}
            alt="Selected photo"
            className="pointer-events-none max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="p-6 text-center text-sm text-v2-muted">
            Select a photo to preview
          </span>
        )}
      </button>
    </div>
  );

  const sheetPane = (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      {selected?.sheet ? (
        <div className="relative flex min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-v2-bg-subtle">
          <button
            type="button"
            disabled={sheetCorrecting}
            onClick={() => openLightbox("sheet")}
            className="relative flex h-full min-h-0 w-full flex-1 cursor-zoom-in items-center justify-center transition hover:ring-2 hover:ring-v2-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary disabled:cursor-wait"
            aria-label="View coloring sheet full screen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.sheet.imageDataUrl}
              alt="Generated coloring sheet"
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
          imageSrc={selected.previewUrl}
          imageAlt="Photo being traced"
          className="min-h-0 w-full flex-1 rounded-xl border border-gray-200"
          imageFit="contain"
        />
      ) : (
        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-v2-primary/30 bg-v2-primary-light/60 p-6 text-center">
          <p className="max-w-xs text-sm text-v2-muted">
            {selected
              ? "This photo doesn’t have a coloring sheet yet."
              : "Select a photo from your library to get started."}
          </p>
          <button
            type="button"
            disabled={!selected || generatingAll}
            onClick={() => void generateForSelected()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-v2-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-v2-primary/20 transition hover:bg-v2-primary-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            Generate coloring sheet
          </button>
        </div>
      )}
    </div>
  );

  return (
    <V2StudioFrame pageScroll>
      {fileInput}
      {/* Phones: nothing here clips or scrolls — the frame scrolls the whole page. */}
      <div className="flex w-full min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:min-h-0 lg:overflow-hidden lg:pb-0">
        <V2LibraryMigrationBanner />
        <V2StudioToolbar
          library={
            deletePagesMode ? (
              /* Delete mode owns the whole toolbar: count, Cancel, Delete. */
              <>
                <button
                  type="button"
                  onClick={toggleSelectAllForDelete}
                  disabled={deletableIds.length === 0}
                  className="v2-studio-toolbar-btn px-3"
                  aria-pressed={allDeletableSelected}
                >
                  {allDeletableSelected ? (
                    <CheckSquare className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <Square className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  {allDeletableSelected ? "Deselect all" : "Select all"}
                </button>
                <span className="min-w-0 flex-1" aria-hidden />
                <button
                  type="button"
                  onClick={exitDeletePagesMode}
                  className="v2-studio-toolbar-btn px-3"
                  style={{ viewTransitionName: "cm-toolbar-cancel" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitBulkDeleteFromRail}
                  disabled={deleteSelectedIds.size === 0}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ viewTransitionName: "cm-toolbar-trash" }}
                >
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  Delete
                  {deleteSelectedIds.size > 0 ? (
                    <span className="rounded-full bg-white/20 px-1.5 text-xs font-bold tabular-nums">
                      {deleteSelectedIds.size}
                    </span>
                  ) : null}
                </button>
              </>
            ) : (
              <>
                <V2ProjectSwitcher onEditingChange={setRenamingProject} />
                {!renamingProject && libraryPhotoCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="v2-studio-toolbar-btn v2-studio-toolbar-btn--icon"
                    title="Upload photos"
                    aria-label="Upload photos"
                  >
                    {uploading ? (
                      <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    )}
                  </button>
                ) : null}
                {!renamingProject && photos.length > 0 ? (
                  <button
                    type="button"
                    onClick={openDeletePagesMode}
                    disabled={uploading || generatingAll}
                    className="v2-studio-toolbar-btn v2-studio-toolbar-btn--danger v2-studio-toolbar-btn--icon"
                    style={{ viewTransitionName: "cm-toolbar-trash" }}
                    title="Delete pages"
                    aria-label="Delete pages"
                  >
                    <Trash2 className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  </button>
                ) : null}
              </>
            )
          }
          studio={
            <>
              <button
                type="button"
                disabled={!sheetReady || downloading || busy}
                onClick={() => void downloadSelected()}
                className="v2-studio-toolbar-btn"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                Download page
              </button>
              <button
                type="button"
                disabled={!sheetReady || busy}
                onClick={openSheetEditChat}
                className="v2-studio-toolbar-btn v2-studio-toolbar-btn--primary"
              >
                <PencilLine className="h-4 w-4 shrink-0" aria-hidden />
                Edit sheet
              </button>
              {selected ? (
                <button
                  type="button"
                  onClick={deleteSelectedPageFromStudio}
                  disabled={busy || deletePagesMode}
                  className="v2-studio-toolbar-btn v2-studio-toolbar-btn--danger"
                >
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  Delete page
                </button>
              ) : null}
            </>
          }
        />

        <div className="flex flex-1 lg:min-h-0 lg:overflow-hidden">
          {/* Photo library — the whole page on phones, a fixed column on desktop */}
          <div className="v2-photo-list-column flex w-full min-w-0 flex-1 flex-col bg-white lg:min-h-0 lg:overflow-hidden lg:w-[min(100%,22rem)] lg:max-w-sm lg:flex-none lg:border-r lg:border-gray-200 xl:w-80">
            <section className="flex flex-1 flex-col px-4 pt-3 sm:px-5 lg:min-h-0 lg:overflow-hidden lg:pt-4">
              <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <h2 className="text-base font-semibold tracking-tight text-v2-ink">
                  Your Photos
                  <span className="ml-1.5 font-medium text-v2-muted tabular-nums">
                    {libraryPhotoCount}
                  </span>
                </h2>
                {generateAllButton}
              </div>

              {libraryPhotoCount === 0 ? (
                <V2UploadDropzone
                  className="mb-4 min-h-[16rem] lg:-mx-5 lg:mb-0 lg:rounded-none lg:border-x-0 lg:border-b-0"
                  onFiles={(files) => void ingestFiles(files)}
                >
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="v2-dropzone-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-v2-primary shadow-sm">
                      <CloudUpload className="h-7 w-7" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-v2-ink">
                        Upload Photos
                      </p>
                      <p className="mt-0.5 text-xs text-v2-muted">
                        Drag and drop, or select files
                      </p>
                      <p className="mt-1 text-[11px] text-v2-muted">
                        JPG, PNG, HEIC up to 20MB each
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="v2-breathe inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-v2-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-v2-primary-dark"
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <ImageIcon className="h-4 w-4" aria-hidden />
                      )}
                      Select Photos
                    </button>
                  </div>
                </V2UploadDropzone>
              ) : null}

              {libraryPhotoCount > 0 ? (
                <div className="v2-photo-list-dock min-h-0 flex-1">
                  <div
                    className="v2-photo-list-scroll v2-photo-list-dock-scroll overscroll-y-contain"
                    aria-label="Uploaded photos"
                  >
                    <V2PhotoLibraryList
                      photos={photos}
                      pendingUploads={pendingUploads}
                      selectedId={selectedId}
                      onSelect={openPhoto}
                      onReorder={replacePhotos}
                      onGenerateSheet={(id) => {
                        if (generatingAll || coloringApiLockRef.current) return;
                        void generateForPhoto(id);
                      }}
                      generateDisabled={generatingAll || anyGenerating}
                      deleteMode={deletePagesMode}
                      deleteSelectedIds={deleteSelectedIds}
                      onToggleDeleteSelect={toggleDeletePagesSelection}
                    />
                  </div>
                  <div className="v2-photo-list-dock-bar">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!hasAnySheet || printingBook || busy || anyGenerating}
                        onClick={() => void downloadPrintBook()}
                        className="v2-photo-list-dock-cta v2-photo-list-dock-cta--secondary"
                        title="Download a print-ready PDF"
                      >
                        {printingBook ? (
                          <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <Printer className="h-5 w-5 shrink-0" aria-hidden />
                        )}
                        Print
                      </button>
                      <button
                        type="button"
                        disabled={!canBuyBook}
                        onClick={buyBook}
                        className="v2-photo-list-dock-cta"
                      >
                        <BookOpen className="h-5 w-5 shrink-0" aria-hidden />
                        Buy book
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

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
                    onClick={() => setMobileStudioOpen(false)}
                    className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle lg:hidden"
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
                      aria-label={gridView ? "Showing all photos as a grid" : "Showing the selected photo and sheet"}
                      title={gridView ? "Switch to sheet view" : "Switch to grid view"}
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

                {/* Phone-only: revisions + page actions */}
                {showRevisionSidebar && selected && !gridView ? (
                  <V2SheetRevisionStrip
                    variant="compact"
                    className="shrink-0 border-t border-gray-100 px-3 py-2 lg:hidden"
                    revisions={selectedRevisions}
                    activeRevisionId={activeRevisionId}
                    onSelect={(revisionId) =>
                      selectSheetRevision(selected.id, revisionId)
                    }
                    disabled={sheetCorrecting}
                  />
                ) : null}
                {selected ? (
                  <footer className="grid shrink-0 grid-cols-3 gap-2 border-t border-gray-100 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
                    <button
                      type="button"
                      disabled={!sheetReady || downloading || busy}
                      onClick={() => void downloadSelected()}
                      className="v2-studio-action"
                    >
                      {downloading ? (
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      ) : (
                        <Download className="h-5 w-5" aria-hidden />
                      )}
                      Download
                    </button>
                    <button
                      type="button"
                      disabled={!sheetReady || busy}
                      onClick={openSheetEditChat}
                      className="v2-studio-action v2-studio-action--primary"
                    >
                      <PencilLine className="h-5 w-5" aria-hidden />
                      Edit sheet
                    </button>
                    <button
                      type="button"
                      disabled={busy || deletePagesMode}
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
                  onSelect={(revisionId) =>
                    selectSheetRevision(selected.id, revisionId)
                  }
                  onEditSheet={openSheetEditChat}
                  editDisabled={busy}
                  disabled={sheetCorrecting}
                />
              ) : null}
            </section>
          </main>
        </div>
      </div>

      {selected?.sheet ? (
        <V2SheetEditChat
          open={editChatOpen}
          onClose={() => setEditChatOpen(false)}
          originalPreviewUrl={selected.previewUrl}
          sheetImageUrl={selected.sheet.imageDataUrl}
          messages={editMessages}
          onSend={(text) => void applySheetEdit(text)}
          busy={sheetCorrecting}
          disabled={!sheetReady}
        />
      ) : null}

      {lightboxFocus && selected ? (
        <V2AssetLightbox
          focus={lightboxFocus}
          originalSrc={selected.previewUrl}
          sheetSrc={selected.sheet?.imageDataUrl ?? null}
          viewMode={lightboxViewMode}
          onViewModeChange={setLightboxViewMode}
          onClose={closeLightbox}
          onSaveOverlayRevision={saveOverlaySheetRevision}
          saveOverlayRevisionBusy={savingOverlayRevision}
        />
      ) : null}

      {sheetCredits.addCreditModal}

      <V2DeletePagesConfirmModal
        open={deleteConfirmOpen}
        pageCount={pendingDeleteIds.length}
        onConfirm={confirmPermanentDelete}
        onCancel={cancelPermanentDelete}
      />
    </V2StudioFrame>
  );
}
