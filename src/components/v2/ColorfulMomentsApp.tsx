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
import {
  V2AssetLightbox,
  type LightboxFocus,
} from "@/components/v2/V2AssetLightbox";
import { V2PhotoLibraryList } from "@/components/v2/V2PhotoLibraryList";
import { V2UploadDropzone } from "@/components/v2/V2UploadDropzone";
import { cn } from "@/lib/cn";
import { isAllowedPhotoFile } from "@/lib/photo/heicFile";
import { inferPhotoLayout } from "@/lib/photo/orientation";
import { readBlobImageSize } from "@/lib/photo/readImageSize";
import { preparePhotoFileForApi } from "@/lib/photo/preparePhotoUpload";
import {
  defaultPrintPrefs,
  type PrintPrefs,
} from "@/lib/print/settings";
import { PHOTO_UPLOAD_MAX_BYTES } from "@/lib/session/photoTypes";
import type { GeneratedSheet } from "@/lib/session/types";

type PhotoEntry = {
  id: string;
  previewUrl: string;
  photoDataUrl: string;
  printPrefs: PrintPrefs;
  sheet: GeneratedSheet | null;
  generating: boolean;
};

function newId() {
  return crypto.randomUUID();
}

function ProgressStepper({
  photosCount,
  hasSheet,
}: {
  photosCount: number;
  hasSheet: boolean;
}) {
  const step1 = photosCount > 0;
  const step2 = hasSheet;

  return (
    <ol className="flex flex-col gap-3">
      <li className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white",
            step1 ? "bg-rose-400" : "bg-slate-200 text-slate-500",
          )}
        >
          {step1 ? <Check className="h-4 w-4" strokeWidth={3} /> : "1"}
        </span>
        <span
          className={cn(
            "text-sm font-medium",
            step1 ? "text-slate-800" : "text-slate-400",
          )}
        >
          Photos Uploaded
        </span>
      </li>
      <li className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white",
            step2 ? "bg-emerald-500" : step1 ? "bg-v2-primary" : "bg-slate-200 text-slate-500",
          )}
        >
          {step2 ? <Check className="h-4 w-4" strokeWidth={3} /> : "2"}
        </span>
        <span
          className={cn(
            "text-sm font-medium",
            step2 ? "text-slate-800" : "text-slate-400",
          )}
        >
          Sheets Generated
        </span>
      </li>
      <li className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
            step2 ? "bg-v2-primary text-white" : "bg-slate-200 text-slate-500",
          )}
        >
          3
        </span>
        <span
          className={cn(
            "text-sm font-medium",
            step2 ? "text-slate-800" : "text-slate-400",
          )}
        >
          Download &amp; Print
        </span>
      </li>
    </ol>
  );
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
      updatePhoto(photoId, {
        sheet: payload.sheet,
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
        entry.generating ? { ...entry, generating: false } : entry,
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

  const anyGenerating = photos.some((entry) => entry.generating);
  const busy = (selected?.generating ?? false) || generatingAll;
  const sheetReady = Boolean(selected?.sheet);
  const hasAnySheet = photos.some((entry) => entry.sheet);
  const needsSheetCount = photos.filter((entry) => !entry.sheet).length;
  const uploading = pendingUploads.length > 0;
  const libraryPhotoCount = photos.length + pendingUploads.length;
  const canGenerateAll =
    needsSheetCount > 0 && !uploading && !generatingAll && !anyGenerating;

  return (
    <div className="flex min-h-dvh flex-col pb-20 lg:pb-0">
      <V2TopBar />

      <div className="flex flex-1">
        <V2Sidebar />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
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
            <div className="mb-6 mt-2">
              <p
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-800"
                role="alert"
              >
                {error}
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
            {/* Photo library column */}
            <div className="flex flex-col gap-4 lg:col-span-4 xl:col-span-3">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Your Photos ({libraryPhotoCount})
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
                  className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-indigo-200 bg-indigo-50/50 px-4 py-2.5 text-sm font-semibold text-v2-primary transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
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
              ) : null}
            </section>

            <section
              className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5"
              aria-label="Progress"
            >
              <ProgressStepper
                photosCount={photos.length}
                hasSheet={hasAnySheet}
              />
            </section>
            </div>

            {/* Preview & actions — wider column on desktop for larger previews */}
            <section className="flex flex-col gap-4 lg:col-span-8 xl:col-span-9">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:gap-6">
                  <div className="flex min-w-0 flex-col">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Original
                      </h3>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600"
                        aria-label="Edit photo (coming soon)"
                      >
                        <Crop className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={!selected}
                      onClick={() => selected && openLightbox("original")}
                      className={cn(
                        "flex min-h-[220px] w-full flex-1 items-center justify-center overflow-hidden rounded-xl bg-slate-100 sm:min-h-[280px] lg:min-h-[min(420px,52vh)] xl:min-h-[min(480px,58vh)]",
                        selected &&
                          "cursor-zoom-in transition hover:ring-2 hover:ring-v2-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary",
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
                          className="pointer-events-none max-h-[min(480px,58vh)] w-full object-contain"
                        />
                      ) : (
                        <span className="p-4 text-center text-sm text-v2-muted">
                          Select a photo to preview
                        </span>
                      )}
                    </button>
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">
                      Coloring Sheet
                    </h3>
                    <button
                      type="button"
                      disabled={!selected?.sheet || busy}
                      onClick={() =>
                        selected?.sheet && openLightbox("sheet")
                      }
                      className={cn(
                        "relative flex min-h-[220px] w-full flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white sm:min-h-[280px] lg:min-h-[min(420px,52vh)] xl:min-h-[min(480px,58vh)]",
                        selected?.sheet &&
                          !busy &&
                          "cursor-zoom-in transition hover:ring-2 hover:ring-v2-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary",
                        (!selected?.sheet || busy) && "cursor-default",
                      )}
                      aria-label={
                        selected?.sheet
                          ? "View coloring sheet full screen"
                          : undefined
                      }
                    >
                      {busy ? (
                        <span className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-v2-primary" />
                          <span className="text-sm text-v2-muted">
                            Tracing your photo into line art…
                          </span>
                        </span>
                      ) : selected?.sheet ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={selected.sheet.imageDataUrl}
                          alt="Generated coloring sheet"
                          className="pointer-events-none max-h-[min(480px,58vh)] w-full object-contain"
                        />
                      ) : (
                        <span className="p-4 text-center text-sm text-v2-muted">
                          Generate a sheet to see line art here
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {sheetReady && !busy ? (
                  <div className="mt-4 flex gap-3 rounded-xl border border-v2-success-border bg-v2-success-bg px-4 py-3">
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

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  disabled={!selected || busy || generatingAll}
                  onClick={() => void generateForSelected()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Generate Sheets
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={!sheetReady || downloading || busy}
                    onClick={() => void downloadSelected()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-v2-primary transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                  <button
                    type="button"
                    disabled={!hasAnySheet || printingBook || busy || anyGenerating}
                    onClick={() => void downloadPrintBook()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-v2-primary transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {printingBook ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Printer className="h-4 w-4" />
                    )}
                    Print Book
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <V2BottomNav />

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
