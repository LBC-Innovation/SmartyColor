"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Check, ImagePlus, Palette, Pencil, ShieldCheck, Sparkles } from "lucide-react";
import { WizardProgress } from "@/components/v2/book-packages/WizardProgress";
import { BOOK_PACKAGES } from "@/content/marketing";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import type { AlbumPurchaseCode } from "@/lib/purchaseCodes/types";
import { V2UploadDropzone } from "@/components/v2/V2UploadDropzone";
import { BEST_PHOTOS, NEW_ALBUM, STUDIO_EMPTY } from "@/content/marketing";
import { PLACEHOLDER_ALBUM_NAME, isAutomaticAlbumName } from "@/components/v2/studio/albumNames";
import { cn } from "@/lib/cn";
import { fillCopy } from "@/lib/marketing/copy";
import { formatPhotoSizeLimit, PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo/payloadBudget";

/** Album names are capped here, as in the album menu's rename field. */
const NAME_MAX = 80;

type Props = {
  albumName: string;
  /** False for an album someone shared with you: only its owner names it. */
  canRename: boolean;
  onRename: (name: string) => void;
  /** Opens the photo picker. */
  onChoose: () => void;
  onFiles: (files: File[]) => void;
  onHowItWorks: () => void;
  /** The line under the drop title (landing-page visitors get their own). */
  line: string;
  /** Signed out: photos stay on this device, so say so. */
  guest: boolean;
  /** The album holds a book package: shows what it includes, the theme, and how many photos are left. */
  pkg?: {
    code: AlbumPurchaseCode;
    photosLeft: number;
    theme: string | null;
    canEditTheme: boolean;
    onEditTheme: () => void;
  } | null;
};

function suggestions(): string[] {
  const year = String(new Date().getFullYear());
  return NEW_ALBUM.suggestions.map((s) => s.replace("{year}", year));
}

/**
 * What a brand-new, empty album shows: give it a name (it starts with a made-up one), then add its
 * first photos. An example pair beside it shows what a photo becomes, with a few photo tips.
 * Give it `key={albumId}`, so opening another empty album starts over from that album's name.
 */
export function StudioEmptyAlbum({ albumName, canRename, onRename, onChoose, onFiles, onHowItWorks, line, guest, pkg }: Props) {
  const automatic = canRename && isAutomaticAlbumName(albumName);
  const [editing, setEditing] = useState(automatic);
  // A placeholder ("Album 3") starts the field empty; a landing-page name ("Gift book") is kept to edit.
  const [draft, setDraft] = useState(() => (PLACEHOLDER_ALBUM_NAME.test(albumName.trim()) ? "" : albumName));
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // A fresh album asks for its name first. Not on touch screens: the keyboard would cover the page.
  useEffect(() => {
    if (!automatic) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    inputRef.current?.focus({ preventScroll: true });
    // Only when the album first shows, not on every rename.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(timer);
  }, [saved]);

  function commit(value: string) {
    const name = value.trim().slice(0, NAME_MAX);
    if (!name) {
      // Left blank: keep whatever it was called.
      setDraft(PLACEHOLDER_ALBUM_NAME.test(albumName.trim()) ? "" : albumName);
      if (!automatic) setEditing(false);
      return;
    }
    setDraft(name);
    setEditing(false);
    if (name !== albumName) {
      onRename(name);
      setSaved(true);
    }
  }

  const pkgTokens = pkg
    ? {
        ...packageTokens({
          bindingId: pkg.code.bundle.bindingId,
          includedPhotos: pkg.code.bundle.includedPages,
          editsPerPhoto: pkg.code.bundle.editsPerPage,
        }),
        photosLeft: pkg.photosLeft,
      }
    : null;
  // Slots never come back when a photo is deleted, so an empty package album can have none left.
  const pkgUsedUp = pkg != null && pkg.photosLeft <= 0;
  const dropLine = pkgTokens
    ? (fillPackageCopy(pkgUsedUp ? BOOK_PACKAGES.landingPickNone : BOOK_PACKAGES.landingPick, pkgTokens) ?? line)
    : line;
  const named = !editing && !automatic;
  const dropTitle = named ? NEW_ALBUM.dropTitleNamed.replace("{name}", albumName) : NEW_ALBUM.dropTitle;

  return (
    <section
      aria-label="New album"
      className="relative overflow-hidden rounded-3xl border border-v2-primary/15 bg-white shadow-[0_1px_2px_rgb(10_16_26/0.04),0_18px_48px_-20px_rgb(36_26_77/0.28)]"
    >
      <div className="v2-modal-strip h-1.5" aria-hidden />

      <div className="relative grid gap-10 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-14 lg:p-12">
        {/* ---- Name, then photos ---- */}
        <div className="flex min-w-0 flex-col gap-8">
          {pkg ? <WizardProgress step={4} className="-mb-2" /> : null}
          <div>
            {named ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="v2-brand-title min-w-0 break-words text-[1.75rem] leading-tight text-v2-ink sm:text-4xl">
                  {albumName}
                </h2>
                {canRename ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(albumName);
                    setEditing(true);
                    requestAnimationFrame(() => inputRef.current?.select());
                  }}
                  className="v2-hit inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold text-v2-link transition hover:bg-v2-primary-light"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {NEW_ALBUM.rename}
                </button>
                ) : null}
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-v2-success-text transition-opacity duration-300",
                    saved ? "opacity-100" : "opacity-0",
                  )}
                  aria-live="polite"
                >
                  {saved ? (
                    <>
                      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                      {NEW_ALBUM.nameSaved}
                    </>
                  ) : null}
                </span>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commit(draft);
                }}
              >
                <label className="sr-only" htmlFor={inputId}>
                  {NEW_ALBUM.nameLabel}
                </label>
                <div className="group flex items-center gap-2 border-b-2 border-v2-primary/15 pb-1.5 transition-colors focus-within:border-v2-primary">
                  <input
                    ref={inputRef}
                    id={inputId}
                    value={draft}
                    maxLength={NAME_MAX}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commit(draft)}
                    onKeyDown={(e) => {
                      if (e.key !== "Escape") return;
                      setDraft(automatic ? "" : albumName);
                      if (!automatic) setEditing(false);
                      inputRef.current?.blur();
                    }}
                    placeholder={NEW_ALBUM.namePlaceholder}
                    autoComplete="off"
                    enterKeyHint="done"
                    className="v2-brand-title v2-album-name-input min-w-0 flex-1 bg-transparent text-[1.75rem] leading-tight text-v2-ink outline-none placeholder:text-v2-muted/45 sm:text-4xl"
                  />
                  <Pencil className="h-5 w-5 shrink-0 text-v2-primary/40 transition group-focus-within:opacity-0" aria-hidden />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {suggestions().map((s) => (
                    <button
                      key={s}
                      type="button"
                      // Keep focus in the field, so picking one doesn't first save what was typed.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commit(s)}
                      className="min-h-8 rounded-full bg-v2-bg-subtle px-3 text-sm text-v2-navy transition hover:bg-v2-primary-light hover:text-v2-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </form>
            )}
          </div>

          {pkg && pkgTokens ? (
            <div className="-mt-2 space-y-2">
              <div className="rounded-xl border border-v2-success-border bg-v2-success-bg p-3 text-v2-success-text">
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                  {fillPackageCopy(pkgUsedUp ? BOOK_PACKAGES.meterAllMain : BOOK_PACKAGES.landingIncluded, pkgTokens)}
                </p>
                <p className="mt-0.5 text-sm">
                  {fillPackageCopy(
                    pkg.code.bundle.editsPerPage > 0 ? BOOK_PACKAGES.landingSub : "{bindingName}",
                    pkgTokens,
                  )}
                </p>
              </div>
              {pkg.canEditTheme ? (
                <p className="flex min-w-0 items-center gap-2 text-sm text-v2-muted">
                  <Palette className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
                  <span className="min-w-0 truncate" title={pkg.theme ?? undefined}>
                    {pkg.theme ? fillPackageCopy(BOOK_PACKAGES.themeRowSet, { theme: pkg.theme }) : BOOK_PACKAGES.themeRowNone}
                  </span>
                  <button type="button" onClick={pkg.onEditTheme} className="v2-hit-y shrink-0 font-semibold text-v2-link">
                    {pkg.theme ? BOOK_PACKAGES.themeChange : BOOK_PACKAGES.themeAdd}
                  </button>
                </p>
              ) : null}
            </div>
          ) : null}

          <V2UploadDropzone
            className="!flex-none rounded-2xl !border-v2-primary/20 !bg-v2-primary-light/40"
            onFiles={(files) => onFiles(Array.from(files))}
          >
            <div className="flex flex-col items-center px-5 py-10 text-center sm:px-8 sm:py-12">
              <h3 className="v2-brand-title text-xl text-v2-ink sm:text-2xl">{dropTitle}</h3>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-v2-muted">{dropLine}</p>
              <button type="button" onClick={onChoose} className="v2-btn-primary v2-radiate mt-6 min-h-12 w-full max-w-xs text-base">
                <ImagePlus className="h-5 w-5" aria-hidden />
                {NEW_ALBUM.button}
              </button>
              <p className="mt-3 text-xs text-v2-muted">
                <span className="hidden pointer-fine:inline">{NEW_ALBUM.dragHint}, </span>
                {fillCopy(NEW_ALBUM.sizeLimit, { size: formatPhotoSizeLimit(PHOTO_UPLOAD_MAX_BYTES) })}
              </p>
            </div>
          </V2UploadDropzone>

          {guest ? (
            <p className="-mt-4 flex items-start gap-2 text-xs text-v2-muted">
              <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
              {STUDIO_EMPTY.guestNote}
            </p>
          ) : null}
        </div>

        {/* ---- What a photo becomes, and what makes a good one ---- */}
        <div className="flex min-w-0 flex-col gap-6">
          <figure className="mx-auto w-full max-w-md">
            <div className="relative aspect-[5/4]">
              <span className="absolute left-0 top-2 w-[62%] -rotate-[5deg] overflow-hidden rounded-xl border-4 border-white bg-white shadow-lg shadow-slate-900/15">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/marketing/hero-photo-400.webp"
                  srcSet="/marketing/hero-photo-400.webp 400w, /marketing/hero-photo-800.webp 800w"
                  sizes="(min-width: 1024px) 18rem, 60vw"
                  alt="A family smiling on a balcony above the beach"
                  className="aspect-[4/3] w-full object-cover"
                />
              </span>
              <span className="absolute bottom-0 right-0 w-[66%] rotate-[3deg] overflow-hidden rounded-xl border-4 border-white bg-white shadow-xl shadow-slate-900/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/marketing/hero-sheet-400.webp"
                  srcSet="/marketing/hero-sheet-400.webp 400w, /marketing/hero-sheet-800.webp 800w"
                  sizes="(min-width: 1024px) 19rem, 64vw"
                  alt="The same photo as a black-and-white coloring page"
                  className="aspect-[4/3] w-full object-cover"
                />
              </span>
              <span className="absolute bottom-[12%] left-[4%] z-10 inline-flex items-center gap-1.5 rounded-full bg-v2-plum px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
                <Sparkles className="h-3.5 w-3.5 text-brand-amber" aria-hidden />
                {NEW_ALBUM.exampleTime}
              </span>
            </div>
            <figcaption className="mt-3 text-center text-sm font-medium text-v2-navy">{NEW_ALBUM.exampleCaption}</figcaption>
          </figure>

          <div className="mx-auto w-full max-w-md">
            <p className="text-sm font-semibold text-v2-ink">{BEST_PHOTOS.title}</p>
            <ul className="mt-2.5 space-y-1.5">
              {BEST_PHOTOS.items.map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-sm text-v2-muted">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-primary" strokeWidth={2.5} aria-hidden />
                  {tip}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onHowItWorks}
              className="v2-hit mt-4 inline-flex items-center gap-1 text-sm font-semibold text-v2-link hover:underline"
            >
              {NEW_ALBUM.guide}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
