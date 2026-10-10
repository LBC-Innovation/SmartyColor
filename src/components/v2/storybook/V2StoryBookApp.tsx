"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  BookOpen,
  CloudUpload,
  Crop,
  Download,
  ImageIcon,
  Loader2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { V2Sidebar, V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2PhotoLibraryList } from "@/components/v2/V2PhotoLibraryList";
import { V2ProjectNameField } from "@/components/v2/V2ProjectNameField";
import { V2ProjectsPanel } from "@/components/v2/V2ProjectsPanel";
import { V2UploadDropzone } from "@/components/v2/V2UploadDropzone";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import { cn } from "@/lib/cn";
import { applyPhotoCropDataUrl } from "@/lib/photo/applyPhotoCrop";
import { compositeSheetOverlayDataUrl } from "@/lib/photo/compositeSheetOverlay";
import { isAllowedPhotoFile } from "@/lib/photo/heicFile";
import { inferPhotoLayout } from "@/lib/photo/orientation";
import { readBlobImageSize } from "@/lib/photo/readImageSize";
import { readPhotoCapturedAt } from "@/lib/photo/readPhotoCapturedAt";
import { preparePhotoFileForApi } from "@/lib/photo/preparePhotoUpload";
import {
  formatPhotoSizeLimit,
  PHOTO_UPLOAD_MAX_BYTES,
} from "@/lib/photo/payloadBudget";
import { defaultPrintPrefs, type PrintPrefs } from "@/lib/print/settings";
import type { GeneratedSheet } from "@/lib/session/types";
import {
  sortPhotosByCapturedAt,
  type StoryChatMessage,
  type StoryPrintArtMode,
} from "@/lib/v2/storybookTypes";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";
import { V2StoryPhotoChat } from "@/components/v2/storybook/V2StoryPhotoChat";
import { V2StoryPhotoCropModal } from "@/components/v2/storybook/V2StoryPhotoCropModal";
import { V2StoryModeReader } from "@/components/v2/storybook/V2StoryModeReader";

function newId() {
  return crypto.randomUUID();
}

const PHASE_TABS = [
  { id: "setup" as const, label: "Trip setup" },
  { id: "photos" as const, label: "Photo notes" },
  { id: "story" as const, label: "Write story" },
  { id: "review" as const, label: "Story mode" },
];

export function V2StoryBookApp() {
  const toast = useV2Toast();
  const {
    hydrated,
    activeProject,
    photos,
    pendingUploads,
    selectedId,
    setSelectedId,
    setPendingUploads,
    replacePhotos,
    updatePhoto,
    trackPreviewUrl,
    tripNarrative,
    setTripNarrative,
    familyContext,
    setFamilyContext,
    generatedStory,
    setGeneratedStory,
    printArtMode,
    setPrintArtMode,
    storyPhase,
    setStoryPhase,
  } = useV2Studio();

  const fileRef = useRef<HTMLInputElement>(null);
  const coloringApiLockRef = useRef(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [generatingStory, setGeneratingStory] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [readerPage, setReaderPage] = useState(0);
  const [artUrlCache, setArtUrlCache] = useState<Record<string, string>>({});

  const selected = photos.find((p) => p.id === selectedId) ?? null;
  const libraryPhotoCount = photos.length + pendingUploads.length;
  const uploading = pendingUploads.length > 0;
  const albumTitle = activeProject?.name ?? "Story album";

  useEffect(() => {
    setChatOpen(false);
    setCropOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (storyPhase === "review" && generatedStory) {
      setReaderPage(0);
    }
  }, [storyPhase, generatedStory]);

  const resolveArtUrl = useCallback(
    async (photo: V2PhotoEntry): Promise<string> => {
      if (artUrlCache[photo.id]) return artUrlCache[photo.id];

      let base = await applyPhotoCropDataUrl(
        photo.photoDataUrl,
        photo.crop ?? null,
      );

      if (printArtMode === "coloring" && photo.sheet) {
        base = photo.sheet.imageDataUrl;
      } else if (printArtMode === "blended" && photo.sheet) {
        base = await compositeSheetOverlayDataUrl(
          base,
          photo.sheet.imageDataUrl,
          45,
        );
      }

      setArtUrlCache((prev) => ({ ...prev, [photo.id]: base }));
      return base;
    },
    [artUrlCache, printArtMode],
  );

  useEffect(() => {
    setArtUrlCache({});
  }, [printArtMode]);

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

    const newEntries: V2PhotoEntry[] = [];
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
        newEntries.push(entry);
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : "Could not read this photo.";
        toast.error(`Could not add "${file.name}": ${detail}`);
      } finally {
        setPendingUploads((prev) => prev.filter((item) => item.id !== pendingId));
      }
    }

    if (newEntries.length > 0) {
      const merged = sortPhotosByCapturedAt([...photos, ...newEntries]);
      replacePhotos(merged);
      setSelectedId((current) => current ?? firstAddedId);
      setStoryPhase("photos");
      toast.success({
        message: `Added ${newEntries.length} photo${newEntries.length === 1 ? "" : "s"} — sorted by date taken.`,
      });
    }
  }

  async function generateForPhoto(id: string) {
    if (coloringApiLockRef.current) return;
    const photo = photos.find((p) => p.id === id);
    if (!photo || photo.generating) return;

    coloringApiLockRef.current = true;
    updatePhoto(id, { generating: true });
    try {
      const res = await fetch("/api/photo-coloring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          photoDataUrl: photo.photoDataUrl,
          printPrefs: photo.printPrefs,
        }),
      });
      const data = (await res.json()) as { error?: string; sheet?: GeneratedSheet };
      if (!res.ok || !data.sheet) {
        throw new Error(data.error ?? "Could not make a coloring page.");
      }
      updatePhoto(id, { sheet: data.sheet, generating: false });
      toast.success({
        message: "Coloring page ready for blended or coloring-book print.",
      });
    } catch (err) {
      updatePhoto(id, { generating: false });
      toast.error(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      coloringApiLockRef.current = false;
    }
  }

  async function sendPhotoChat(text: string) {
    if (!selected) return;

    const prior = selected.chatMessages ?? [];
    const userMessage: StoryChatMessage = {
      id: newId(),
      role: "user",
      text,
    };
    const history = [...prior, userMessage];
    updatePhoto(selected.id, { chatMessages: history });
    setChatBusy(true);

    try {
      const res = await fetch("/api/storybook/photo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albumTitle,
          tripNarrative,
          familyContext,
          userCaption: selected.userCaption ?? "",
          photoSummary: selected.photoSummary ?? null,
          history: prior,
          userMessage: text,
          photoDataUrl: selected.photoDataUrl,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        assistantMessage?: string;
        photoSummary?: string | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Chat failed.");

      const assistant: StoryChatMessage = {
        id: newId(),
        role: "assistant",
        text: data.assistantMessage ?? "Got it!",
      };
      updatePhoto(selected.id, {
        chatMessages: [...history, assistant],
        photoSummary: data.photoSummary ?? selected.photoSummary ?? null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chat failed.");
    } finally {
      setChatBusy(false);
    }
  }

  async function generateStory() {
    if (photos.length === 0) {
      toast.error("Upload photos first.");
      return;
    }
    if (!tripNarrative.trim()) {
      toast.error("Describe the trip in Trip setup.");
      setStoryPhase("setup");
      return;
    }

    setGeneratingStory(true);
    try {
      const timeline = sortPhotosByCapturedAt(photos);
      const res = await fetch("/api/storybook/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albumTitle,
          tripNarrative,
          familyContext,
          photoIds: timeline.map((p) => p.id),
          photos: timeline.map((p) => ({
            capturedAt: p.capturedAt ?? "",
            userCaption: p.userCaption ?? "",
            photoSummary: p.photoSummary ?? null,
          })),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        story?: NonNullable<typeof generatedStory>;
      };
      if (!res.ok || !data.story) {
        throw new Error(data.error ?? "Story generation failed.");
      }
      setGeneratedStory(data.story);
      setStoryPhase("review");
      toast.success({
        message: "Your story is ready — open Story mode to read it.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate story.");
    } finally {
      setGeneratingStory(false);
    }
  }

  async function downloadStoryPdf() {
    if (!generatedStory) return;

    setDownloadingPdf(true);
    try {
      const pages = await Promise.all(
        generatedStory.pages.map(async (page) => {
          const photo = photos.find((p) => p.id === page.photoId);
          if (!photo) throw new Error("Missing photo for a story page.");
          const imageDataUrl = await resolveArtUrl(photo);
          return {
            imageDataUrl,
            text: page.text,
            printPrefs: photo.printPrefs,
          };
        }),
      );

      const res = await fetch("/api/pdf/storybook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: generatedStory.title,
          introduction: generatedStory.introduction,
          closing: generatedStory.closing,
          pages,
          printPrefs: photos[0]?.printPrefs ?? defaultPrintPrefs,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "PDF failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${generatedStory.title.replace(/\s+/g, "-").slice(0, 40) || "storybook"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success({ message: "Story PDF downloaded." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  function renderPrintModePicker() {
    const modes: { id: StoryPrintArtMode; label: string; hint: string }[] = [
      {
        id: "photos",
        label: "Original photos",
        hint: "Full-color pictures on each page",
      },
      {
        id: "coloring",
        label: "Coloring book",
        hint: "Line-art pages (use Generate on each photo)",
      },
      {
        id: "blended",
        label: "Blended",
        hint: "Photo with a light coloring overlay",
      },
    ];

    return (
      <div className="grid gap-2 sm:grid-cols-3">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setPrintArtMode(mode.id)}
            className={cn(
              "rounded-xl border px-3 py-3 text-left transition",
              printArtMode === mode.id
                ? "border-v2-primary bg-v2-primary-light ring-1 ring-v2-primary/25"
                : "border-gray-200 hover:border-gray-300",
            )}
          >
            <p className="text-sm font-semibold text-v2-ink">{mode.label}</p>
            <p className="mt-1 text-xs text-v2-muted">{mode.hint}</p>
          </button>
        ))}
      </div>
    );
  }

  if (!hydrated) {
    return (
      <V2StudioFrame sidebar={<V2Sidebar showProgress={false} />}>
        <div className="flex flex-1 items-center justify-center pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <p className="flex items-center gap-2 text-sm text-v2-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Restoring your studio…
          </p>
        </div>
      </V2StudioFrame>
    );
  }

  return (
    <V2StudioFrame sidebar={<V2Sidebar showProgress={false} />}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void ingestFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="v2-photo-list-column flex max-h-[min(52dvh,32rem)] min-h-0 w-full min-w-0 shrink-0 flex-col gap-4 overflow-hidden sm:max-h-[min(48dvh,34rem)] lg:max-h-none lg:w-[min(100%,22rem)] lg:max-w-sm lg:shrink-0 lg:self-stretch lg:border-r lg:border-gray-200 lg:bg-white xl:w-80">
            <div className="v2-panel shrink-0 p-3 sm:p-4 lg:hidden">
              <V2ProjectsPanel compact />
            </div>
            <section className="v2-panel flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:ring-0">
              <div className="mb-2 shrink-0 lg:mb-3">
                <V2ProjectNameField variant="workspace" />
              </div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-v2-primary">
                <BookOpen className="h-3.5 w-3.5" />
                Story book
              </p>
              <div className="mb-3 shrink-0">
                <h2 className="text-lg font-semibold tracking-tight text-v2-ink">
                  Your Photos
                  <span className="ml-1.5 text-base font-medium text-v2-muted">
                    ({libraryPhotoCount})
                  </span>
                </h2>
              </div>

              {photos.length > 0 ? (
                <div className="mb-2 flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-v2-ink"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                    Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      replacePhotos(sortPhotosByCapturedAt(photos));
                      toast.success({ message: "Photos sorted by date taken." });
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-v2-primary/30 bg-v2-primary-light px-4 py-2 text-sm font-semibold text-v2-link"
                  >
                    <ArrowDownUp className="h-4 w-4" />
                    Sort by date
                  </button>
                </div>
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
                        Same library as My Projects — add trip photos here
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-v2-primary px-4 py-2 text-sm font-semibold text-white"
                    >
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
                      onGenerateSheet={(id) => void generateForPhoto(id)}
                    />
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/"
                className="text-xs font-medium text-v2-link hover:underline"
              >
                ← Coloring studio
              </Link>
              {generatedStory ? (
                <button
                  type="button"
                  disabled={downloadingPdf}
                  onClick={() => void downloadStoryPdf()}
                  className="inline-flex items-center gap-2 rounded-full bg-v2-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {downloadingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download PDF
                </button>
              ) : null}
            </div>

            <nav
              className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-v2-bg-subtle p-1"
              aria-label="Story book steps"
            >
              {PHASE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStoryPhase(tab.id)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm",
                    storyPhase === tab.id
                      ? "bg-white text-v2-link shadow-sm"
                      : "text-v2-muted hover:text-v2-ink",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {storyPhase === "setup" ? (
                <div className="mx-auto flex max-w-2xl flex-col gap-4">
                  <p className="text-sm text-v2-muted">
                    Use the project name above as your story title. Describe who
                    traveled and what the trip was about — the same photos in{" "}
                    <strong className="font-semibold text-v2-ink">
                      Your Photos
                    </strong>{" "}
                    will become story pages.
                  </p>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-v2-ink">
                      Family & travelers
                    </span>
                    <textarea
                      value={familyContext}
                      onChange={(e) => setFamilyContext(e.target.value)}
                      rows={3}
                      placeholder="Wife Sarah, Emma (8, 3rd grade), Noah (5, kindergarten)…"
                      className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none ring-v2-primary focus:ring-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-v2-ink">
                      Trip narrative (brief)
                    </span>
                    <textarea
                      value={tripNarrative}
                      onChange={(e) => setTripNarrative(e.target.value)}
                      rows={5}
                      placeholder="We flew to Orlando in July 2026…"
                      className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none ring-v2-primary focus:ring-2"
                    />
                  </label>
                  <button
                    type="button"
                    className="self-start rounded-full bg-v2-primary px-5 py-2.5 text-sm font-semibold text-white"
                    onClick={() =>
                      photos.length > 0
                        ? setStoryPhase("photos")
                        : fileRef.current?.click()
                    }
                  >
                    {photos.length > 0 ? "Continue to photo notes" : "Upload photos"}
                  </button>
                </div>
              ) : null}

              {storyPhase === "photos" ? (
                selected ? (
                  <div className="mx-auto flex max-w-2xl flex-col gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.previewUrl}
                      alt=""
                      className="max-h-72 w-full rounded-xl object-contain bg-v2-bg-subtle"
                    />
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-v2-ink">
                        Short caption
                      </span>
                      <textarea
                        value={selected.userCaption ?? ""}
                        onChange={(e) =>
                          updatePhoto(selected.id, { userCaption: e.target.value })
                        }
                        rows={3}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none ring-v2-primary focus:ring-2"
                      />
                    </label>
                    {selected.photoSummary ? (
                      <p className="rounded-lg bg-v2-bg-subtle px-3 py-2 text-xs text-v2-muted">
                        <span className="font-semibold text-v2-ink">Story note: </span>
                        {selected.photoSummary}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setChatOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Chat about this photo
                      </button>
                      <button
                        type="button"
                        onClick={() => setCropOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium"
                      >
                        <Crop className="h-4 w-4" />
                        Crop for print
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-v2-muted">
                    Select a photo from Your Photos to add captions and chat notes.
                  </p>
                )
              ) : null}

              {storyPhase === "story" ? (
                <div className="mx-auto flex max-w-2xl flex-col gap-4">
                  <p className="text-sm text-v2-muted">
                    Timeline uses photo order in Your Photos — tap{" "}
                    <strong className="font-semibold text-v2-ink">Sort by date</strong>{" "}
                    if you want capture-time order.
                  </p>
                  <ul className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
                    <li>{photos.length} photos</li>
                    <li>
                      {
                        photos.filter(
                          (p) =>
                            p.userCaption?.trim() ||
                            p.photoSummary?.trim() ||
                            (p.chatMessages?.length ?? 0) > 0,
                        ).length
                      }{" "}
                      with story notes
                    </li>
                  </ul>
                  {renderPrintModePicker()}
                  <button
                    type="button"
                    disabled={generatingStory}
                    onClick={() => void generateStory()}
                    className="inline-flex w-fit items-center gap-2 rounded-full bg-v2-primary px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {generatingStory ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Generate story
                  </button>
                </div>
              ) : null}

              {storyPhase === "review" && generatedStory ? (
                <div className="flex min-h-[min(60dvh,520px)] flex-col gap-4">
                  {renderPrintModePicker()}
                  <V2StoryModeReader
                    story={generatedStory}
                    photos={photos}
                    printArtMode={printArtMode}
                    pageIndex={readerPage}
                    onPageIndexChange={setReaderPage}
                    resolveArtUrl={resolveArtUrl}
                    artUrlCache={artUrlCache}
                  />
                  <button
                    type="button"
                    onClick={() => setStoryPhase("story")}
                    className="self-start text-sm font-medium text-v2-link hover:underline"
                  >
                    Regenerate story
                  </button>
                </div>
              ) : storyPhase === "review" ? (
                <p className="text-sm text-v2-muted">
                  Generate a story first, then read it here.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {selected ? (
        <>
          <V2StoryPhotoChat
            open={chatOpen}
            previewUrl={selected.previewUrl}
            messages={selected.chatMessages ?? []}
            onClose={() => setChatOpen(false)}
            onSend={(text) => void sendPhotoChat(text)}
            busy={chatBusy}
          />
          <V2StoryPhotoCropModal
            open={cropOpen}
            previewUrl={selected.previewUrl}
            initialCrop={selected.crop ?? null}
            onClose={() => setCropOpen(false)}
            onSave={(crop) => {
              updatePhoto(selected.id, { crop });
              setCropOpen(false);
              setArtUrlCache((prev) => {
                const next = { ...prev };
                delete next[selected.id];
                return next;
              });
              toast.success({
                message: crop ? "Crop saved." : "Using full photo.",
              });
            }}
          />
        </>
      ) : null}
    </V2StudioFrame>
  );
}
