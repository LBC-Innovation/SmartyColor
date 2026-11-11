"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  Check,
  CheckSquare,
  CloudUpload,
  Loader2,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { V2LibraryMigrationBanner } from "@/components/v2/V2LibraryMigrationBanner";
import { V2PhotoLibraryList } from "@/components/v2/V2PhotoLibraryList";
import { V2ProjectSwitcher } from "@/components/v2/V2ProjectSwitcher";
import { V2StudioToolbar } from "@/components/v2/V2StudioToolbar";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { V2UploadDropzone } from "@/components/v2/V2UploadDropzone";
import type { V2LibraryDeletion } from "@/components/v2/library/useV2LibraryDeletion";
import { BEST_PHOTOS, STUDIO_EMPTY } from "@/content/marketing";
import { fillCopy } from "@/lib/marketing/copy";
import { formatPhotoSizeLimit, PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo/payloadBudget";

type V2LibraryWorkspaceProps = {
  /** Hidden file input; the page clicks it from its own "upload" buttons too. */
  fileInputRef: RefObject<HTMLInputElement | null>;
  /** Files from the picker or the drop zone. */
  onFiles: (files: FileList | File[]) => void;
  onSelectPhoto: (id: string) => void;
  onGenerateSheet: (id: string) => void;
  generateDisabled?: boolean;
  /** Enables "Delete pages" mode in the toolbar and list. */
  deletion?: V2LibraryDeletion;
  deleteDisabled?: boolean;
  /** Control beside the "Your Photos" heading (Refresh, Make all pages…). */
  headerAction?: ReactNode;
  /** Pinned under the list — on phones it floats above the tab bar. */
  dock?: ReactNode;
  /** Desktop-only actions in the right half of the toolbar. */
  studioActions?: ReactNode;
  /** The empty-library card. Defaults to the coloring-page onboarding; other studios bring their own words. */
  emptyState?: {
    title?: string;
    line?: string;
    /** Short tips under the button; an empty list hides them. */
    tips?: string[];
    /** Shows a "How it works" link that runs this. */
    onHowItWorks?: () => void;
  };
  /** The page's main pane: the right column on desktop, usually a full-screen view on phones. */
  children: ReactNode;
};

/**
 * The photo library sidebar every studio page shares: project switcher and
 * upload/delete toolbar, "Your Photos" list with drag reorder, and a pinned
 * call to action. On phones the list is the page itself and `children`
 * decide how they appear (My albums and Story book open full-screen views).
 */
export function V2LibraryWorkspace({
  fileInputRef,
  onFiles,
  onSelectPhoto,
  onGenerateSheet,
  generateDisabled,
  deletion,
  deleteDisabled,
  headerAction,
  dock,
  studioActions,
  emptyState,
  children,
}: V2LibraryWorkspaceProps) {
  const { photos, pendingUploads, selectedId, replacePhotos, cloud } = useV2Studio();
  /** While the project name is being edited the toolbar is given over to that. */
  const [renamingProject, setRenamingProject] = useState(false);
  // The dock floats over the end of the list; reserve exactly its height so it never hides a photo.
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const dockShown = Boolean(dock) && photos.length + pendingUploads.length > 0;
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setDockHeight(Math.ceil(el.getBoundingClientRect().height)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [dockShown]);

  const uploading = pendingUploads.length > 0;
  const libraryPhotoCount = photos.length + pendingUploads.length;
  const deleteMode = deletion?.active ?? false;
  const emptyTips = emptyState?.tips ?? BEST_PHOTOS.items;

  function openPicker() {
    fileInputRef.current?.click();
  }

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:min-h-0 lg:overflow-hidden lg:pb-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        onChange={(event) => {
          const list = event.target.files;
          if (list?.length) onFiles(list);
          event.target.value = "";
        }}
      />

      <V2LibraryMigrationBanner />

      <V2StudioToolbar
        library={
          deletion && deleteMode ? (
            /* Delete mode owns the whole toolbar: count, Cancel, Delete. */
            <>
              <button
                type="button"
                onClick={deletion.toggleAll}
                disabled={deletion.deletableCount === 0}
                className="v2-studio-toolbar-btn px-3"
                aria-pressed={deletion.allSelected}
              >
                {deletion.allSelected ? (
                  <CheckSquare className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <Square className="h-4 w-4 shrink-0" aria-hidden />
                )}
                {deletion.allSelected ? "Deselect all" : "Select all"}
              </button>
              <span className="min-w-0 flex-1" aria-hidden />
              <button
                type="button"
                onClick={deletion.exit}
                className="v2-studio-toolbar-btn px-3"
                style={{ viewTransitionName: "cm-toolbar-cancel" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deletion.requestSelected}
                disabled={deletion.selectedIds.size === 0}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ viewTransitionName: "cm-toolbar-trash" }}
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                Delete
                {deletion.selectedIds.size > 0 ? (
                  <span className="rounded-full bg-white/20 px-1.5 text-xs font-bold tabular-nums">
                    {deletion.selectedIds.size}
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
                  onClick={openPicker}
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
              {deletion && !renamingProject && photos.length > 0 ? (
                <button
                  type="button"
                  onClick={deletion.enter}
                  disabled={deleteDisabled}
                  className="v2-studio-toolbar-btn v2-studio-toolbar-btn--danger v2-studio-toolbar-btn--icon"
                  style={{ viewTransitionName: "cm-toolbar-trash" }}
                  title="Delete photos"
                  aria-label="Delete photos"
                >
                  <Trash2 className="h-[18px] w-[18px] shrink-0" aria-hidden />
                </button>
              ) : null}
            </>
          )
        }
        studio={studioActions}
      />

      <div className="flex flex-1 lg:min-h-0 lg:overflow-hidden">
        {/* Photo library — the whole page on phones, a fixed column on desktop */}
        <div className="v2-photo-list-column flex w-full min-w-0 flex-1 flex-col bg-white lg:min-h-0 lg:overflow-hidden lg:w-[min(100%,22rem)] lg:max-w-sm lg:flex-none lg:border-r lg:border-gray-200 xl:w-80">
          <section className="flex flex-1 flex-col px-4 pt-3 sm:px-5 lg:min-h-0 lg:overflow-hidden lg:pt-4">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <h2 className="shrink-0 whitespace-nowrap text-base font-semibold tracking-tight text-v2-ink">
                Your Photos
                <span className="ml-1.5 font-medium text-v2-muted tabular-nums">
                  {libraryPhotoCount}
                </span>
              </h2>
              {headerAction}
            </div>

            {libraryPhotoCount === 0 ? (
              <V2UploadDropzone
                className="mb-4 min-h-[16rem] lg:-mx-5 lg:mb-0 lg:rounded-none lg:border-x-0 lg:border-b-0"
                onFiles={onFiles}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="v2-dropzone-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-v2-primary shadow-sm">
                    <CloudUpload className="h-7 w-7" strokeWidth={1.5} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="v2-brand-title text-lg text-v2-ink">{emptyState?.title ?? STUDIO_EMPTY.title}</h3>
                    <p className="mt-1 text-sm text-v2-muted">{emptyState?.line ?? STUDIO_EMPTY.line}</p>
                  </div>
                  <button
                    type="button"
                    onClick={openPicker}
                    className="v2-btn-primary v2-breathe min-h-11 w-full"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="h-4 w-4" aria-hidden />
                    )}
                    {STUDIO_EMPTY.button}
                  </button>

                  {emptyTips.length > 0 ? (
                  <div className="w-full text-left">
                    <p className="text-xs font-semibold text-v2-navy">{BEST_PHOTOS.title}</p>
                    <ul className="mt-1.5 space-y-1">
                      {emptyTips.map((tip) => (
                        <li key={tip} className="flex items-start gap-2 text-xs text-v2-muted">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-v2-primary" aria-hidden />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                  ) : null}

                  <p className="text-[11px] leading-relaxed text-v2-muted">
                    {fillCopy(STUDIO_EMPTY.formats, { size: formatPhotoSizeLimit(PHOTO_UPLOAD_MAX_BYTES) })}
                    <span className="hidden pointer-fine:inline"> {STUDIO_EMPTY.dragHint}</span>
                  </p>
                  {!cloud ? (
                    <p className="flex items-start justify-center gap-1.5 text-[11px] leading-relaxed text-v2-muted">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {STUDIO_EMPTY.guestNote}
                    </p>
                  ) : null}
                  {emptyState?.onHowItWorks ? (
                  <button
                    type="button"
                    onClick={emptyState.onHowItWorks}
                    className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-v2-link underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
                  >
                    {STUDIO_EMPTY.howItWorks}
                  </button>
                  ) : null}
                </div>
              </V2UploadDropzone>
            ) : null}

            {libraryPhotoCount > 0 ? (
              <div
                className="v2-photo-list-dock min-h-0 flex-1"
                style={dockHeight ? ({ "--v2-dock-height": `${dockHeight}px` } as CSSProperties) : undefined}
              >
                <div
                  className="v2-photo-list-scroll v2-photo-list-dock-scroll overscroll-y-contain"
                  aria-label="Uploaded photos"
                >
                  <V2PhotoLibraryList
                    photos={photos}
                    pendingUploads={pendingUploads}
                    selectedId={selectedId}
                    onSelect={onSelectPhoto}
                    onReorder={replacePhotos}
                    onGenerateSheet={onGenerateSheet}
                    generateDisabled={generateDisabled}
                    deleteMode={deleteMode}
                    deleteSelectedIds={deletion?.selectedIds}
                    onToggleDeleteSelect={deletion?.toggle}
                  />
                </div>
                {dock ? (
                  <div ref={dockRef} className="v2-photo-list-dock-bar">
                    {dock}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>

        {children}
      </div>
    </div>
  );
}
