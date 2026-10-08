"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CloudUpload,
  Crop,
  Download,
  ImageIcon,
  Loader2,
  Printer,
  Sparkles,
} from "lucide-react";
import { V2BottomNav, V2Sidebar, V2TopBar } from "@/components/v2/V2Chrome";
import { V2ProgressStepper } from "@/components/v2/V2ProgressStepper";
import {
  V2AssetLightbox,
  type LightboxFocus,
} from "@/components/v2/V2AssetLightbox";
import { V2PhotoLibraryList } from "@/components/v2/V2PhotoLibraryList";
import { V2SheetRevisionStrip } from "@/components/v2/V2SheetRevisionStrip";
import {
  V2SheetEditChat,
  type SheetEditMessage,
} from "@/components/v2/V2SheetEditChat";
import { V2UploadDropzone } from "@/components/v2/V2UploadDropzone";
import { cn } from "@/lib/cn";
import { compressImageDataUrlForApi } from "@/lib/photo/compressImageDataUrl";
import { isAllowedPhotoFile } from "@/lib/photo/heicFile";
import { inferPhotoLayout } from "@/lib/photo/orientation";
import { readBlobImageSize } from "@/lib/photo/readImageSize";
import { preparePhotoFileForApi } from "@/lib/photo/preparePhotoUpload";
import {
  defaultPrintPrefs,
  type PrintPrefs,
} from "@/lib/print/settings";
import {
  PHOTO_MAX_CORRECTION_CHARS,
  PHOTO_UPLOAD_MAX_BYTES,
} from "@/lib/session/photoTypes";
import type { GeneratedSheet, SheetVersion } from "@/lib/session/types";

type PhotoEntry = {
  id: string;
  previewUrl: string;
  photoDataUrl: string;
  printPrefs: PrintPrefs;
  sheet: GeneratedSheet | null;
  sheetRevisions?: SheetVersion[];
  activeRevisionId?: string | null;
  generating: boolean;
  correcting?: boolean;
};

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

function normalizeSheetRevisions(photo: PhotoEntry): SheetVersion[] {
  if (photo.sheetRevisions && photo.sheetRevisions.length > 0) {
    return photo.sheetRevisions;
  }
  if (photo.sheet) {
    return [
      {
        id: `${photo.id}-rev-1`,
        createdAt: "",
        sheet: photo.sheet,
      },
    ];
  }
  return [];
}

type PendingUpload = { id: string };

type GenerateResult = "success" | "failed" | "skipped";

export function ColorfulMomentsApp() {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [printingBook, setPrintingBook] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const photosRef = useRef(photos);
  const generateAllRunRef = useRef(false);
  const coloringApiLockRef = useRef(false);
  const [lightboxFocus, setLightboxFocus] = useState<LightboxFocus | null>(
    null,
  );
  const [lightboxCompare, setLightboxCompare] = useState(false);
  const [editChatOpen, setEditChatOpen] = useState(false);
  const [editMessages, setEditMessages] = useState<SheetEditMessage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  const selected = photos.find((p) => p.id === selectedId) ?? null;

  const trackPreviewUrl = useCallback((url: string) => {
    previewUrlsRef.current.add(url);
  }, []);

  const revokeAllPreviews = useCallback(() => {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    previewUrlsRef.current.clear();
  }, []);

  useEffect(() => () => revokeAllPreviews(), [revokeAllPreviews]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    setLightboxFocus(null);
    setLightboxCompare(false);
    setEditChatOpen(false);
    setEditMessages([]);
  }, [selectedId]);

  function openLightbox(focus: LightboxFocus) {
    setLightboxCompare(false);
    setLightboxFocus(focus);
  }

  function closeLightbox() {
    setLightboxFocus(null);
    setLightboxCompare(false);
  }

  async function ingestFiles(fileList: FileList | File[]) {
    setError(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const queue: { file: File; pendingId: string }[] = [];

    for (const file of files) {
      if (!isAllowedPhotoFile(file)) {
        setError("Please choose photos only (JPG, PNG, WebP, or HEIC).");
        continue;
      }
      if (file.size > PHOTO_UPLOAD_MAX_BYTES) {
        setError("A photo is too large. Try one under 8 MB.");
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

        const entry: PhotoEntry = {
          id: newId(),
          previewUrl,
          photoDataUrl: prepared.photoDataUrl,
          printPrefs,
          sheet: null,
          generating: false,
          correcting: false,
        };

        firstAddedId ??= entry.id;
        setPhotos((prev) => {
          const next = [...prev, entry];
          photosRef.current = next;
          return next;
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not read one of the photos.",
        );
      } finally {
        setPendingUploads((prev) => prev.filter((item) => item.id !== pendingId));
      }
    }

    if (firstAddedId) {
      setSelectedId((current) => current ?? firstAddedId);
    }
  }

  function clearAll() {
    revokeAllPreviews();
    photosRef.current = [];
    setPhotos([]);
    setPendingUploads([]);
    setSelectedId(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function replacePhotos(next: PhotoEntry[]) {
    photosRef.current = next;
    setPhotos(next);
  }

  function updatePhoto(id: string, patch: Partial<PhotoEntry>) {
    setPhotos((prev) => {
      const next = prev.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      );
      photosRef.current = next;
      return next;
    });
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
    updatePhoto(photoId, { generating: true });

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
      const payload = (await response.json()) as {
        sheet?: GeneratedSheet;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not make a coloring sheet.");
      }
      if (!payload.sheet) {
        throw new Error("No coloring sheet came back.");
      }
      const revision = createSheetRevision(payload.sheet);
      updatePhoto(photoId, {
        sheet: payload.sheet,
        sheetRevisions: [revision],
        activeRevisionId: revision.id,
        generating: false,
      });
      if (!options?.batch) setError(null);
      return "success";
    } catch (err) {
      updatePhoto(photoId, { generating: false });
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return "failed";
    } finally {
      coloringApiLockRef.current = false;
    }
  }

  function clearAllGeneratingFlags() {
    setPhotos((prev) => {
      const next = prev.map((entry) =>
        entry.generating || entry.correcting
          ? { ...entry, generating: false, correcting: false }
          : entry,
      );
      photosRef.current = next;
      return next;
    });
  }

  async function generateForSelected() {
    if (!selected) {
      setError("Upload and select a photo first.");
      return;
    }
    await generateForPhoto(selected.id);
  }

  function openSheetEditChat() {
    if (!selected?.sheet) {
      setError("Generate a coloring sheet before making edits.");
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
      setError(`Keep each edit note under ${PHOTO_MAX_CORRECTION_CHARS} characters.`);
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
    setError(null);
    coloringApiLockRef.current = true;
    updatePhoto(photo.id, { correcting: true });

    try {
      const sheetDataUrl = await compressImageDataUrlForApi(
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
      const revisions = prior ? [...normalizeSheetRevisions(prior)] : [];
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
      setError(message);
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

  function selectSheetRevision(photoId: string, revisionId: string) {
    setPhotos((prev) => {
      const next = prev.map((entry) => {
        if (entry.id !== photoId) return entry;
        const revisions = normalizeSheetRevisions(entry);
        const picked = revisions.find((item) => item.id === revisionId);
        if (!picked) return entry;
        return {
          ...entry,
          sheetRevisions: revisions,
          activeRevisionId: revisionId,
          sheet: picked.sheet,
        };
      });
      photosRef.current = next;
      return next;
    });
  }

  async function generateAllSheets() {
    if (generateAllRunRef.current) return;

    const queue = photosRef.current
      .filter((entry) => !entry.sheet && !entry.generating)
      .map((entry) => entry.id);

    if (queue.length === 0) {
      if (photosRef.current.length === 0) {
        setError("Upload photos first.");
      }
      return;
    }

    generateAllRunRef.current = true;
    setGeneratingAll(true);
    setError(null);

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
    setError(null);
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
      setError(err instanceof Error ? err.message : "PDF failed.");
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
      setError("Generate at least one coloring sheet to build your print book.");
      return;
    }

    setPrintingBook(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : "Print book failed.");
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
  const studioPreviewStacked =
    selected?.printPrefs.orientation === "landscape";
  const selectedRevisions = selected ? normalizeSheetRevisions(selected) : [];
  const activeRevisionId =
    selected?.activeRevisionId ??
    selectedRevisions[selectedRevisions.length - 1]?.id ??
    null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <V2TopBar />

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <V2Sidebar
          photosCount={photos.length}
          hasSheet={hasAnySheet}
          onDownloadPrint={() => void downloadPrintBook()}
          downloadPrintDisabled={
            !hasAnySheet || printingBook || anyGenerating
          }
          downloadingPrint={printingBook}
        />

        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Photo library — full-height column beside side nav */}
          <div className="flex max-h-[min(52dvh,32rem)] min-h-0 w-full min-w-0 shrink-0 flex-col gap-4 overflow-hidden sm:max-h-[min(48dvh,34rem)] lg:max-h-none lg:w-[min(100%,22rem)] lg:max-w-sm lg:shrink-0 lg:self-stretch lg:border-r lg:border-slate-200/80 lg:bg-white/95 xl:w-80">
            <section className="v2-panel flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:ring-0">
              <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  Your Photos
                  <span className="ml-1.5 text-base font-medium text-v2-muted">
                    ({libraryPhotoCount})
                  </span>
                </h2>
                {libraryPhotoCount > 0 ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-v2-primary transition hover:bg-indigo-50"
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <ImageIcon className="h-4 w-4" aria-hidden />
                      )}
                      Upload More
                    </button>
                    <button
                      type="button"
                      onClick={clearAll}
                      disabled={uploading || generatingAll || anyGenerating}
                      className="text-sm font-medium text-v2-primary hover:text-v2-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear All
                    </button>
                  </div>
                ) : null}
              </div>

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
                      <p className="text-sm font-semibold text-slate-900">
                        Upload Photos
                      </p>
                      <p className="mt-0.5 text-xs text-v2-muted">
                        Drag and drop, or select files
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        JPG, PNG, HEIC up to 20MB each
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-600 hover:to-violet-700"
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

              {photos.length > 0 ? (
                <button
                  type="button"
                  disabled={!canGenerateAll}
                  onClick={() => void generateAllSheets()}
                  className="mb-2 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-indigo-200 bg-indigo-50/50 px-4 py-2.5 text-sm font-semibold text-v2-primary transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
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

              {libraryPhotoCount > 0 ? (
                <div
                  className="v2-photo-list-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
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
                  />
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

            {error ? (
              <div className="mb-4 mt-1 shrink-0">
                <p
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-800"
                  role="alert"
                >
                  {error}
                </p>
              </div>
            ) : null}

            {/* Studio preview & actions */}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
              <div className="v2-panel grid shrink-0 grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
                <button
                  type="button"
                  disabled={!sheetReady || downloading || busy}
                  onClick={() => void downloadSelected()}
                  className="inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-xl border-2 border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-v2-primary transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4 shrink-0" />
                  <span className="truncate">Download</span>
                </button>
                <button
                  type="button"
                  disabled={!hasAnySheet || printingBook || busy || anyGenerating}
                  onClick={() => void downloadPrintBook()}
                  className="inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-xl border-2 border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-v2-primary transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {printingBook ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">Print book</span>
                </button>
              </div>

              <div className="v2-panel flex min-h-0 flex-1 flex-col overflow-hidden p-5 sm:p-6 xl:p-8">
                <div className="mb-4 flex shrink-0 items-end justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                      Studio preview
                    </h2>
                    <p className="mt-1 text-sm text-v2-muted">
                      Compare your photo and coloring sheet at full size.
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    "grid min-h-0 flex-1 gap-4 overflow-hidden sm:gap-4 lg:gap-5 xl:gap-6",
                    studioPreviewStacked
                      ? "grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)]"
                      : "grid-cols-1 sm:grid-cols-2",
                  )}
                >
                  <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Original
                    </h3>
                    <button
                      type="button"
                      disabled={!selected}
                      onClick={() => selected && openLightbox("original")}
                      className={cn(
                        "flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-xl bg-slate-100/90",
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
                  <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        Coloring sheet
                      </h3>
                      <button
                        type="button"
                        disabled={!sheetReady || busy}
                        onClick={openSheetEditChat}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-v2-primary disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Edit coloring sheet"
                      >
                        <Crop className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </div>
                    {sheetBusy ? (
                      <div
                        className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-slate-200/80 bg-white p-6 text-center"
                        aria-busy="true"
                      >
                        <Loader2 className="h-8 w-8 animate-spin text-v2-primary" />
                        <span className="text-sm text-v2-muted">
                          Tracing your photo into line art…
                        </span>
                      </div>
                    ) : selected?.sheet ? (
                      <div className="flex min-h-0 w-full flex-1 gap-2 overflow-hidden">
                        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
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
                              <span className="text-sm font-medium text-slate-700">
                                Applying your edits…
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <V2SheetRevisionStrip
                          revisions={selectedRevisions}
                          activeRevisionId={activeRevisionId}
                          onSelect={(revisionId) =>
                            selectSheetRevision(selected.id, revisionId)
                          }
                          disabled={sheetCorrecting}
                          className="w-[3.25rem] sm:w-14"
                        />
                      </div>
                    ) : (
                      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/20 p-6 text-center">
                        <p className="max-w-xs text-sm text-v2-muted">
                          {selected
                            ? "This photo doesn’t have a coloring sheet yet."
                            : "Select a photo from your library to get started."}
                        </p>
                        <button
                          type="button"
                          disabled={!selected || generatingAll}
                          onClick={() => void generateForSelected()}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
                        >
                          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                          Generate coloring sheet
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {sheetReady && !sheetBusy && !sheetCorrecting ? (
                  <div className="mt-4 flex shrink-0 gap-3 rounded-xl border border-v2-success-border bg-v2-success-bg px-5 py-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-v2-success-text">
                        Coloring sheet ready!
                      </p>
                      <p className="mt-0.5 text-xs text-emerald-700/90">
                        Your photo has been converted to a high-quality coloring
                        page.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </main>
        </div>
      </div>

      <V2BottomNav />

      <V2SheetEditChat
        open={editChatOpen}
        onClose={() => setEditChatOpen(false)}
        messages={editMessages}
        onSend={(text) => void applySheetEdit(text)}
        busy={sheetCorrecting}
        disabled={!sheetReady}
      />

      {lightboxFocus && selected ? (
        <V2AssetLightbox
          focus={lightboxFocus}
          originalSrc={selected.previewUrl}
          sheetSrc={selected.sheet?.imageDataUrl ?? null}
          compare={lightboxCompare}
          onCompareChange={setLightboxCompare}
          onClose={closeLightbox}
        />
      ) : null}
    </div>
  );
}
