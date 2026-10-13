"use client";

import { useRef, useState } from "react";
import {
  ArrowDownUp,
  BookOpen,
  ChevronLeft,
  Download,
  ImageIcon,
  Loader2,
  Luggage,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useSheetUsageCredits } from "@/components/v2/credits/useSheetUsageCredits";
import { V2LibraryWorkspace } from "@/components/v2/library/V2LibraryWorkspace";
import { V2LibraryRefreshButton } from "@/components/v2/library/V2LibraryRefreshButton";
import { useV2LibraryDeletion } from "@/components/v2/library/useV2LibraryDeletion";
import { useV2PhotoIngest } from "@/components/v2/library/useV2PhotoIngest";
import { V2StoryModeReader } from "@/components/v2/storybook/V2StoryModeReader";
import { V2StoryPhotoCropModal } from "@/components/v2/storybook/V2StoryPhotoCropModal";
import { V2StoryPhotoNotes } from "@/components/v2/storybook/V2StoryPhotoNotes";
import { useStoryArt } from "@/components/v2/storybook/useStoryArt";
import { authedFetch } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import type { LibraryPhoto } from "@/lib/library/types";
import { downscaleImageToDataUrl } from "@/lib/photo/downscaleImage";
import type { GeneratedSheet } from "@/lib/session/types";
import { entryFromLibraryPhoto } from "@/lib/v2/cloudLibrary";
import {
  photoStoryNotesComplete,
  sortPhotosByCapturedAt,
  storyTabFromPhase,
  type StoryChatMessage,
  type StoryPrintArtMode,
  type V2GeneratedStory,
  type V2StoryBookTab,
} from "@/lib/v2/storybookTypes";
import { photoPrintPrefs } from "@/lib/v2/studioTypes";

const TABS: { id: V2StoryBookTab; label: string; icon: typeof BookOpen }[] = [
  { id: "setup", label: "Trip", icon: Luggage },
  { id: "photos", label: "Photo notes", icon: MessageSquareText },
  { id: "story", label: "Story", icon: BookOpen },
];

const PRINT_MODES: { id: StoryPrintArtMode; label: string; hint: string }[] = [
  { id: "photos", label: "Photos", hint: "Full-color pictures" },
  { id: "coloring", label: "Coloring book", hint: "Line art — needs a sheet per photo" },
  { id: "blended", label: "Blended", hint: "Photo under light line art" },
];

/** Long edge, in px, of each picture embedded in the PDF (≈150 dpi on letter paper). */
const PDF_ART_MAX_PX = 1600;

export function V2StoryBookApp() {
  const toast = useV2Toast();
  const sheetCredits = useSheetUsageCredits("/storybook");
  const {
    hydrated,
    cloud,
    activeProject,
    photos,
    photosRef,
    pendingUploads,
    selectedId,
    setSelectedId,
    replacePhotos,
    updatePhoto,
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
  const deletion = useV2LibraryDeletion();
  const ingestFiles = useV2PhotoIngest({
    onAdded: (added) => {
      // A first batch lands in capture order; later ones append so a hand-arranged album stays put.
      const firstBatch = added.length === photosRef.current.length;
      if (firstBatch) replacePhotos(sortPhotosByCapturedAt(photosRef.current));
      const count = `${added.length} photo${added.length === 1 ? "" : "s"}`;
      toast.success({
        message: firstBatch ? `Added ${count} — sorted by date taken.` : `Added ${count}.`,
      });
    },
  });
  const art = useStoryArt(printArtMode);

  const fileRef = useRef<HTMLInputElement>(null);
  const coloringApiLockRef = useRef(false);
  /** Below lg the story pane is a full-screen view opened from the list or the dock. */
  const [paneOpen, setPaneOpen] = useState(false);
  const [chatBusyFor, setChatBusyFor] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [generatingStory, setGeneratingStory] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [readerPage, setReaderPage] = useState(0);

  const tab = storyTabFromPhase(storyPhase);
  const selected = photos.find((p) => p.id === selectedId) ?? null;
  const selectedIndex = selected ? photos.indexOf(selected) : -1;
  const uploading = pendingUploads.length > 0;
  const albumTitle = activeProject?.name ?? "Story album";
  const notesCount = photos.filter(photoStoryNotesComplete).length;
  const canGenerate = photos.length > 0 && tripNarrative.trim().length > 0;
  const anyGenerating = photos.some((p) => p.generating);

  function showTab(next: V2StoryBookTab) {
    setStoryPhase(next);
  }

  function selectPhoto(id: string) {
    setCropOpen(false);
    setSelectedId(id);
  }

  function openPhoto(id: string) {
    selectPhoto(id);
    showTab("photos");
    setPaneOpen(true);
  }

  function stepPhoto(delta: -1 | 1) {
    const next = photos[selectedIndex + delta];
    if (next) selectPhoto(next.id);
  }

  function openStoryPane() {
    if (tab === "photos" && !selected) showTab("setup");
    setPaneOpen(true);
  }

  function sortByDate() {
    replacePhotos(sortPhotosByCapturedAt(photosRef.current));
    toast.success({ message: "Photos sorted by date taken." });
  }

  async function generateForPhoto(id: string) {
    if (coloringApiLockRef.current) return;
    const photo = photosRef.current.find((p) => p.id === id);
    if (!photo || photo.generating || photo.sheet) return;
    if (!sheetCredits.canAfford("generation", photo)) return;

    coloringApiLockRef.current = true;
    updatePhoto(id, { generating: true });
    try {
      const res = await authedFetch(
        "/api/photo-coloring",
        {
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
        },
        { withAuth: Boolean(photo.remote) },
      );
      const data = (await res.json()) as {
        error?: string;
        sheet?: GeneratedSheet;
        photo?: LibraryPhoto;
        code?: string;
        creditsBalanceCents?: number;
      };
      if (sheetCredits.applyResponse(res.status, data, "generation")) {
        updatePhoto(id, { generating: false });
        return;
      }
      if (!res.ok || (!data.sheet && !data.photo)) {
        throw new Error(data.error ?? "Could not make a coloring page.");
      }
      if (data.photo) {
        const fresh = await entryFromLibraryPhoto(data.photo);
        updatePhoto(id, { ...fresh, generating: false }, { persist: false });
      } else {
        updatePhoto(id, { sheet: data.sheet, generating: false });
      }
      toast.success({ message: "Coloring page ready for blended or coloring-book print." });
    } catch (err) {
      updatePhoto(id, { generating: false });
      toast.error(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      coloringApiLockRef.current = false;
    }
  }

  async function sendPhotoChat(photoId: string, text: string) {
    const photo = photosRef.current.find((p) => p.id === photoId);
    if (!photo || chatBusyFor) return;

    const prior = photo.chatMessages ?? [];
    const userMessage: StoryChatMessage = { id: crypto.randomUUID(), role: "user", text };
    const history = [...prior, userMessage];
    updatePhoto(photoId, { chatMessages: history });
    setChatBusyFor(photoId);

    try {
      const res = await authedFetch(
        "/api/storybook/photo-chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            albumTitle,
            tripNarrative,
            familyContext,
            userCaption: photo.userCaption ?? "",
            photoSummary: photo.photoSummary ?? null,
            history: prior,
            userMessage: text,
            ...(photo.remote
              ? { photoId: photo.remote.photoId }
              : { photoDataUrl: photo.photoDataUrl }),
          }),
        },
        { withAuth: Boolean(photo.remote) },
      );
      const data = (await res.json()) as {
        error?: string;
        assistantMessage?: string;
        photoSummary?: string | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Chat failed.");

      const assistant: StoryChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.assistantMessage ?? "Got it!",
      };
      updatePhoto(photoId, {
        chatMessages: [...history, assistant],
        photoSummary: data.photoSummary ?? photo.photoSummary ?? null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chat failed.");
    } finally {
      setChatBusyFor(null);
    }
  }

  async function generateStory() {
    if (photos.length === 0) {
      toast.error("Upload photos first.");
      return;
    }
    if (!tripNarrative.trim()) {
      toast.error("Describe the trip first.");
      showTab("setup");
      return;
    }

    setGeneratingStory(true);
    try {
      // Pages follow the album order: drag to arrange, or use Sort by date.
      const timeline = photosRef.current;
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
      const data = (await res.json()) as { error?: string; story?: V2GeneratedStory };
      if (!res.ok || !data.story) {
        throw new Error(data.error ?? "Story generation failed.");
      }
      setGeneratedStory(data.story);
      setReaderPage(0);
      showTab("story");
      toast.success({ message: "Your story is ready." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate story.");
    } finally {
      setGeneratingStory(false);
    }
  }

  async function downloadStoryPdf() {
    if (!generatedStory || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const { buildStorybookPdf } = await import("@/lib/print/storybookPdf");
      const pages = [];
      let missing = 0;
      // One page at a time: compositing every photo at once can exhaust memory on a phone.
      for (const page of generatedStory.pages) {
        const photo = photosRef.current.find((p) => p.id === page.photoId);
        if (!photo) {
          missing += 1;
          continue;
        }
        const source = await art.ensureArt(photo);
        const imageDataUrl = await downscaleImageToDataUrl(source, PDF_ART_MAX_PX, {
          format: printArtMode === "coloring" && photo.sheet ? "png" : "jpeg",
        });
        pages.push({ imageDataUrl, text: page.text, printPrefs: photoPrintPrefs(photo) });
      }
      if (pages.length === 0) {
        throw new Error("None of this story's photos are in the album anymore. Generate it again.");
      }
      const bytes = await buildStorybookPdf({
        title: generatedStory.title,
        introduction: generatedStory.introduction,
        closing: generatedStory.closing,
        pages,
        printPrefs: pages[0].printPrefs,
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${generatedStory.title.replace(/\s+/g, "-").slice(0, 40) || "storybook"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success({ message: "Story PDF downloaded." });
      if (missing > 0) {
        toast.info(
          missing === 1
            ? "1 page was skipped because its photo was deleted."
            : `${missing} pages were skipped because their photos were deleted.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not make the PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

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

  const printModePicker = (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Page art">
      {PRINT_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          aria-pressed={printArtMode === mode.id}
          onClick={() => setPrintArtMode(mode.id)}
          className={cn(
            "rounded-xl border px-2.5 py-2.5 text-left transition sm:px-3",
            printArtMode === mode.id
              ? "border-v2-primary bg-v2-primary-light ring-1 ring-v2-primary/25"
              : "border-gray-200 bg-white hover:border-gray-300",
          )}
        >
          <p className="text-xs font-semibold text-v2-ink sm:text-sm">{mode.label}</p>
          <p className="mt-0.5 hidden text-[11px] leading-snug text-v2-muted sm:block">{mode.hint}</p>
        </button>
      ))}
    </div>
  );

  const generateButton = (
    <button
      type="button"
      disabled={generatingStory || photos.length === 0}
      onClick={() => void generateStory()}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        generatedStory
          ? "border border-v2-primary/30 bg-white text-v2-link hover:bg-v2-primary-light"
          : "bg-v2-primary text-white shadow-md shadow-v2-primary/20 hover:bg-v2-primary-dark",
      )}
    >
      {generatingStory ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="h-4 w-4" aria-hidden />
      )}
      {generatingStory ? "Writing…" : generatedStory ? "Rewrite story" : "Write the story"}
    </button>
  );

  const downloadButton = (className?: string) => (
    <button
      type="button"
      disabled={!generatedStory || downloadingPdf}
      onClick={() => void downloadStoryPdf()}
      className={className}
    >
      {downloadingPdf ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <Download className="h-4 w-4 shrink-0" aria-hidden />
      )}
      Download PDF
    </button>
  );

  return (
    <V2StudioFrame pageScroll>
      <V2LibraryWorkspace
        fileInputRef={fileRef}
        onFiles={(files) => void ingestFiles(files)}
        onSelectPhoto={openPhoto}
        onGenerateSheet={(id) => void generateForPhoto(id)}
        generateDisabled={anyGenerating}
        deletion={deletion}
        deleteDisabled={uploading}
        headerAction={cloud ? <V2LibraryRefreshButton disabled={uploading} /> : null}
        uploadHint="Same library as My Projects — add trip photos here"
        dock={
          <button type="button" onClick={openStoryPane} className="v2-photo-list-dock-cta">
            <BookOpen className="h-5 w-5 shrink-0" aria-hidden />
            {generatedStory ? "Read story" : "Write story"}
          </button>
        }
        studioActions={
          <>
            <button
              type="button"
              disabled={photos.length < 2}
              onClick={sortByDate}
              className="v2-studio-toolbar-btn"
            >
              <ArrowDownUp className="h-4 w-4 shrink-0" aria-hidden />
              Sort by date
            </button>
            {downloadButton("v2-studio-toolbar-btn v2-studio-toolbar-btn--primary")}
          </>
        }
      >
        {/* Story pane — right column on desktop, full-screen view on phones */}
        <main
          className={cn(
            "flex-col bg-v2-bg",
            paneOpen ? "v2-safe-overlay fixed inset-0 z-[45] flex" : "hidden",
            "lg:static lg:z-auto lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:overflow-hidden lg:p-4 xl:p-6",
          )}
          aria-label="Story book"
        >
          <section className="v2-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 shadow-none lg:rounded-2xl lg:border lg:shadow-[0_1px_2px_rgb(10_16_26/0.04),0_8px_24px_rgb(10_16_26/0.05)]">
            <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-gray-100 px-3 py-2 sm:px-5 lg:px-6 lg:py-3">
              <button
                type="button"
                onClick={() => setPaneOpen(false)}
                className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle lg:hidden"
                aria-label="Back to photos"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
              <h2 className="flex h-9 min-w-0 flex-1 items-center truncate text-base font-semibold tracking-tight text-v2-ink lg:flex-none lg:text-lg">
                Story book
              </h2>
              <span className="hidden flex-1 lg:block" aria-hidden />
              <nav
                className="flex basis-full gap-1 rounded-xl bg-v2-bg-subtle p-1 lg:basis-auto"
                aria-label="Story book steps"
              >
                {TABS.map((item) => {
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={active ? "step" : undefined}
                      onClick={() => showTab(item.id)}
                      className={cn(
                        "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition sm:px-3 sm:text-sm lg:min-h-9 lg:flex-none",
                        active ? "bg-white text-v2-link shadow-sm" : "text-v2-muted hover:text-v2-ink",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </header>

            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 sm:p-5 lg:p-6",
                tab === "photos" && selected && "pb-0 sm:pb-0 lg:overflow-hidden lg:pb-6",
              )}
            >
              {tab === "setup" ? (
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
                  <p className="text-sm leading-relaxed text-v2-muted">
                    Your story is titled{" "}
                    <strong className="font-semibold text-v2-ink">{albumTitle}</strong> — rename
                    the album to change it. Tell us who traveled and what the trip was about;
                    every photo in Your Photos becomes a page.
                  </p>
                  <label className="block">
                    <span className="v2-label">Family &amp; travelers</span>
                    <textarea
                      value={familyContext}
                      onChange={(e) => setFamilyContext(e.target.value)}
                      rows={3}
                      placeholder="Wife Sarah, Emma (8, 3rd grade), Noah (5, kindergarten)…"
                      className="v2-input"
                    />
                  </label>
                  <label className="block">
                    <span className="v2-label">Trip narrative</span>
                    <textarea
                      value={tripNarrative}
                      onChange={(e) => setTripNarrative(e.target.value)}
                      rows={5}
                      placeholder="We flew to Orlando in July 2026…"
                      className="v2-input"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-v2-primary px-5 text-sm font-semibold text-white shadow-md shadow-v2-primary/20 transition hover:bg-v2-primary-dark"
                      onClick={() => {
                        if (photos.length === 0) {
                          fileRef.current?.click();
                          return;
                        }
                        if (!selected) selectPhoto(photos[0].id);
                        showTab("photos");
                      }}
                    >
                      {photos.length > 0 ? (
                        <MessageSquareText className="h-4 w-4" aria-hidden />
                      ) : (
                        <ImageIcon className="h-4 w-4" aria-hidden />
                      )}
                      {photos.length > 0 ? "Continue to photo notes" : "Upload photos"}
                    </button>
                  </div>
                </div>
              ) : null}

              {tab === "photos" ? (
                selected ? (
                  <V2StoryPhotoNotes
                    key={selected.id}
                    photo={selected}
                    index={selectedIndex}
                    count={photos.length}
                    onStep={stepPhoto}
                    onCaptionChange={(text) => updatePhoto(selected.id, { userCaption: text })}
                    onOpenCrop={() => setCropOpen(true)}
                    onSend={(text) => void sendPhotoChat(selected.id, text)}
                    busy={chatBusyFor === selected.id}
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
                    <p className="max-w-xs text-sm text-v2-muted">
                      {photos.length > 0
                        ? "Pick a photo from Your Photos to add a caption and notes."
                        : "Upload trip photos first — each one becomes a story page."}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        photos.length > 0 ? setPaneOpen(false) : fileRef.current?.click()
                      }
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-v2-primary/30 bg-white px-5 text-sm font-semibold text-v2-link lg:hidden"
                    >
                      <ImageIcon className="h-4 w-4" aria-hidden />
                      {photos.length > 0 ? "Choose a photo" : "Upload photos"}
                    </button>
                  </div>
                )
              ) : null}

              {tab === "story" ? (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                  {!generatedStory ? (
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-sm font-semibold text-v2-ink">Ready to write</p>
                      <ul className="mt-1 space-y-0.5 text-sm text-v2-muted">
                        <li>
                          {photos.length} {photos.length === 1 ? "photo" : "photos"}, in the
                          order shown in Your Photos
                        </li>
                        <li>{notesCount} with captions or notes</li>
                      </ul>
                      {!canGenerate ? (
                        <p className="mt-3 text-xs text-amber-700">
                          {photos.length === 0 ? (
                            "Upload photos first."
                          ) : (
                            <>
                              Describe the trip first —{" "}
                              <button
                                type="button"
                                onClick={() => showTab("setup")}
                                className="font-semibold underline"
                              >
                                open Trip
                              </button>
                              .
                            </>
                          )}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {printModePicker}

                  {generatedStory ? (
                    <V2StoryModeReader
                      story={generatedStory}
                      photos={photos}
                      printArtMode={printArtMode}
                      pageIndex={readerPage}
                      onPageIndexChange={setReaderPage}
                      getArt={art.getArt}
                      ensureArt={art.ensureArt}
                    />
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:pb-0">
                    {generatedStory
                      ? downloadButton(
                          "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-v2-primary px-5 text-sm font-semibold text-white shadow-md shadow-v2-primary/20 transition hover:bg-v2-primary-dark disabled:cursor-not-allowed disabled:opacity-50 lg:hidden",
                        )
                      : null}
                    {generateButton}
                    {photos.length > 1 ? (
                      <button
                        type="button"
                        onClick={sortByDate}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-v2-link hover:bg-v2-bg-subtle lg:hidden"
                      >
                        <ArrowDownUp className="h-4 w-4" aria-hidden />
                        Sort by date
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </main>
      </V2LibraryWorkspace>

      {selected ? (
        <V2StoryPhotoCropModal
          open={cropOpen}
          previewUrl={selected.previewUrl}
          initialCrop={selected.crop ?? null}
          onClose={() => setCropOpen(false)}
          onSave={(crop) => {
            updatePhoto(selected.id, { crop });
            setCropOpen(false);
            toast.success({ message: crop ? "Crop saved." : "Using full photo." });
          }}
        />
      ) : null}
      {sheetCredits.addCreditModal}
      {deletion.modal}
    </V2StudioFrame>
  );
}
