"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CloudUpload,
  Download,
  ImageIcon,
  Loader2,
  Printer,
  Sparkles,
  Trash2,
} from "lucide-react";
import { V2Sidebar, V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2ProjectNameField } from "@/components/v2/V2ProjectNameField";
import { V2ProjectsPanel } from "@/components/v2/V2ProjectsPanel";
import { V2ProgressStepper } from "@/components/v2/V2ProgressStepper";
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
import { useV2Toast } from "@/components/v2/V2Toast";
import { V2DeletePagesConfirmModal } from "@/components/v2/V2DeletePagesConfirmModal";
import { V2SheetGeneratingPlaceholder } from "@/components/v2/V2SheetGeneratingPlaceholder";
import { V2StudioToolbar } from "@/components/v2/V2StudioToolbar";
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

export function ColorfulMomentsApp() {
  const toast = useV2Toast();
  const {
    hydrated,
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

  const selected = photos.find((p) => p.id === selectedId) ?? null;

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

        const entry: V2PhotoEntry = {
          id: newId(),
          previewUrl,
          photoDataUrl: prepared.photoDataUrl,
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
    setDeletePagesMode(false);
    setDeleteSelectedIds(new Set());
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
    const ids = pendingDeleteIds;
    if (ids.length === 0) {
      setDeleteConfirmOpen(false);
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
  }

  function cancelPermanentDelete() {
    setDeleteConfirmOpen(false);
    setPendingDeleteIds([]);
  }

  function openDeletePagesMode() {
    setDeleteSelectedIds(new Set());
    setDeletePagesMode(true);
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

    coloringApiLockRef.current = true;
    const requestId = crypto.randomUUID();
    generateRequestIdRef.current.set(photoId, requestId);
    mutatePhotos((prev) =>
      prev.map((entry) =>
        entry.id === photoId ? { ...entry, generating: true } : entry,
      ),
    );

    try {
      const response = await fetch("/api/photo-coloring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          photoDataUrl: photo.photoDataUrl,
          printPrefs: photo.printPrefs,
        }),
      });
      const rawBody = await response.text();
      let payload: { sheet?: GeneratedSheet; error?: string };
      try {
        payload = JSON.parse(rawBody) as {
          sheet?: GeneratedSheet;
          error?: string;
        };
      } catch {
        throw new Error(
          "The server sent an unexpected response. Please try again in a moment.",
        );
      }
      if (generateRequestIdRef.current.get(photoId) !== requestId) {
        return "skipped";
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not make a coloring sheet.");
      }
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

    try {
      const sheetDataUrl = await prepareSheetDataUrlForApi(
        photo.sheet.imageDataUrl,
        2,
      );
      const response = await fetch("/api/photo-coloring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "correct",
          photoDataUrl: photo.photoDataUrl,
          sheetDataUrl,
          corrections: [trimmed],
          printPrefs: photo.printPrefs,
        }),
      });
      const payload = (await response.json()) as {
        sheet?: GeneratedSheet;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not apply that edit.");
      }
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
      toast.error(message);
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
        photo.photoDataUrl,
        photo.sheet.imageDataUrl,
        opacityPercent,
      );
      const tintedSheet: GeneratedSheet = {
        title: `${photo.sheet.title} · ${opacityPercent}% tint`,
        imageDataUrl,
        mimeType: "image/png",
      };
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
    replacePhotos(
      photosRef.current.map((entry) => {
        if (entry.id !== photoId) return entry;
        const revisions = normalizeV2SheetRevisions(entry);
        const picked = revisions.find((item) => item.id === revisionId);
        if (!picked) return entry;
        return {
          ...entry,
          sheetRevisions: revisions,
          activeRevisionId: revisionId,
          sheet: picked.sheet,
        };
      }),
    );
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

  async function downloadSelected() {
    if (!selected?.sheet) return;
    setDownloading(true);
    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: selected.sheet.imageDataUrl,
          printPrefs: selected.printPrefs,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not make a PDF.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "colorful-moments-coloring-sheet.pdf";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF failed.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadPrintBook() {
    const pages = photos
      .filter((entry) => entry.sheet)
      .map((entry) => ({
        imageDataUrl: entry.sheet!.imageDataUrl,
        printPrefs: entry.printPrefs,
      }));

    if (pages.length === 0) {
      toast.error(
        "Generate at least one coloring sheet to build your print book.",
      );
      return;
    }

    setPrintingBook(true);
    try {
      const response = await fetch("/api/pdf/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not make the print book PDF.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "colorful-moments-print-book.pdf";
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
    toast.info("Book checkout is coming soon.");
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

  if (!hydrated) {
    return (
      <V2StudioFrame sidebar={<V2Sidebar showProgress={false} />}>
        <div className="flex flex-1 items-center justify-center pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <p className="flex items-center gap-2 text-sm text-v2-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Restoring your studio…
          </p>
        </div>
      </V2StudioFrame>
    );
  }

  return (
    <V2StudioFrame
      sidebar={
        <V2Sidebar
          photosCount={photos.length}
          hasSheet={hasAnySheet}
          onDownloadPrint={() => void downloadPrintBook()}
          downloadPrintDisabled={
            !hasAnySheet || printingBook || anyGenerating
          }
          downloadingPrint={printingBook}
        />
      }
    >
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <V2StudioToolbar
            library={
              <>
                {libraryPhotoCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="v2-studio-toolbar-btn"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <ImageIcon className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    Upload
                  </button>
                ) : null}
                {photos.length > 0 ? (
                  deletePagesMode ? (
                    <>
                      <button
                        type="button"
                        onClick={submitBulkDeleteFromRail}
                        disabled={deleteSelectedIds.size === 0}
                        className="v2-studio-toolbar-btn v2-studio-toolbar-btn--danger"
                      >
                        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                        Delete
                        {deleteSelectedIds.size > 0 ? (
                          <span className="v2-studio-toolbar-badge">
                            {deleteSelectedIds.size}
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={exitDeletePagesMode}
                        className="v2-studio-toolbar-btn"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={openDeletePagesMode}
                      disabled={uploading || generatingAll}
                      className="v2-studio-toolbar-btn v2-studio-toolbar-btn--danger"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                      Delete pages
                    </button>
                  )
                ) : null}
              </>
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
                  disabled={!hasAnySheet || printingBook || busy || anyGenerating}
                  onClick={() => void downloadPrintBook()}
                  className="v2-studio-toolbar-btn v2-studio-toolbar-btn--primary"
                >
                  {printingBook ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <Printer className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  Print book
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

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Photo library — full-height column beside side nav */}
          <div className="v2-photo-list-column flex max-h-[min(52dvh,32rem)] min-h-0 w-full min-w-0 shrink-0 flex-col gap-4 overflow-hidden sm:max-h-[min(48dvh,34rem)] lg:max-h-none lg:w-[min(100%,22rem)] lg:max-w-sm lg:shrink-0 lg:self-stretch lg:border-r lg:border-gray-200 lg:bg-white xl:w-80">
            <div className="v2-panel shrink-0 p-3 sm:p-4 lg:hidden">
              <V2ProjectsPanel compact />
            </div>
            <section className="v2-panel flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:ring-0">
              <div className="mb-2 shrink-0 lg:mb-3">
                <V2ProjectNameField variant="workspace" />
              </div>
              <div className="mb-3 shrink-0">
                <h2 className="text-lg font-semibold tracking-tight text-v2-ink">
                  Your Photos
                  <span className="ml-1.5 text-base font-medium text-v2-muted">
                    ({libraryPhotoCount})
                  </span>
                </h2>
              </div>

              {photos.length > 0 ? (
                <button
                  type="button"
                  disabled={!canGenerateAll}
                  onClick={() => void generateAllSheets()}
                  className="mb-2 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full border border-v2-primary/30 bg-v2-primary-light px-4 py-2.5 text-sm font-semibold text-v2-link transition hover:border-v2-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generatingAll ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden />
                  )}
                  Generate All
                  {needsSheetCount > 0 && !generatingAll ? (
                    <span className="rounded-full bg-v2-primary/15 px-2 py-0.5 text-xs font-bold">
                      {needsSheetCount}
                    </span>
                  ) : null}
                </button>
              ) : null}

              {libraryPhotoCount === 0 ? (
                <V2UploadDropzone
                  className="mb-4"
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
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-v2-primary px-4 py-2 text-sm font-semibold text-white shadow-md shadow-v2-primary/20 transition hover:bg-v2-primary-dark"
                    >
                      {uploading ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden
                        />
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
                      onSelect={setSelectedId}
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
              ) : null}

            </section>

            <section
              className="v2-panel shrink-0 p-5 sm:p-6 lg:hidden"
              aria-label="Progress"
            >
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-v2-muted">
                Your progress
              </p>
              <V2ProgressStepper
                photosCount={photos.length}
                hasSheet={hasAnySheet}
                onDownloadPrint={() => void downloadPrintBook()}
                downloadPrintDisabled={
                  !hasAnySheet || printingBook || anyGenerating
                }
                downloadingPrint={printingBook}
              />
            </section>
          </div>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden px-5 py-4 pb-20 sm:px-6 sm:py-5 lg:overflow-hidden lg:pb-5 lg:pl-6 lg:pr-8 xl:pl-8 xl:pr-10">
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

            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="v2-panel flex min-h-0 flex-1 overflow-hidden">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <div className="shrink-0 border-b border-gray-100 px-5 py-4 sm:px-6 xl:px-8">
                    <div className="flex flex-wrap items-start justify-between gap-3 gap-y-2">
                      <div className="min-w-0">
                        <h2 className="text-xl font-semibold tracking-tight text-v2-ink">
                          Studio preview
                        </h2>
                        <p className="mt-1 text-sm text-v2-muted">
                          Compare your photo and coloring sheet at full size.
                        </p>
                      </div>
                      <V2StudioLayoutToggle
                        className="shrink-0"
                        value={studioLayout}
                        onChange={setStudioLayout}
                      />
                    </div>
                  </div>

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-5 py-4 sm:px-6 sm:py-5 xl:px-8">
                    <div
                      className={cn(
                        "grid min-h-0 flex-1 gap-4 overflow-hidden lg:gap-5 xl:gap-6",
                        studioLayout === "both"
                          ? "grid-cols-1 sm:grid-cols-2"
                          : "grid-cols-1",
                      )}
                    >
                      {showPhotoPane ? (
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
                            aria-label={
                              selected
                                ? "View original photo full screen"
                                : undefined
                            }
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
                      ) : null}

                      {showSheetPane ? (
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
                                <Sparkles
                                  className="h-4 w-4 shrink-0"
                                  aria-hidden
                                />
                                Generate coloring sheet
                              </button>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {showRevisionSidebar && selected ? (
                  <V2SheetRevisionStrip
                    variant="sidebar"
                    className="min-h-0 self-stretch"
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
              </div>
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

      <V2DeletePagesConfirmModal
        open={deleteConfirmOpen}
        pageCount={pendingDeleteIds.length}
        onConfirm={confirmPermanentDelete}
        onCancel={cancelPermanentDelete}
      />
    </V2StudioFrame>
  );
}
