"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ImagePlus, Pencil, ShieldCheck, Sparkles } from "lucide-react";
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
};

function suggestions(): string[] {
  const year = String(new Date().getFullYear());
  return NEW_ALBUM.suggestions.map((s) => s.replace("{year}", year));
}

/**
 * What a brand-new, empty album shows: give it a name (it starts with a made-up one), then add its
 * first photos. An example pair shows what a photo becomes, and three steps say what happens next.
 * Give it `key={albumId}`, so opening another empty album starts over from that album's name.
 */
export function StudioEmptyAlbum({ albumName, canRename, onRename, onChoose, onFiles, onHowItWorks, line, guest }: Props) {
  const automatic = canRename && isAutomaticAlbumName(albumName);
  const [editing, setEditing] = useState(automatic);
  // A placeholder ("Album 3") starts the field empty; a landing-page name ("Gift book") is kept to edit.
  const [draft, setDraft] = useState(() => (PLACEHOLDER_ALBUM_NAME.test(albumName.trim()) ? "" : albumName));
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

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

  const named = !editing && !automatic;
  const dropTitle = named ? NEW_ALBUM.dropTitleNamed.replace("{name}", albumName) : NEW_ALBUM.dropTitle;

  return (
    <section
      aria-label="New album"
      className="relative overflow-hidden rounded-3xl border border-v2-primary/15 bg-white shadow-[0_1px_2px_rgb(10_16_26/0.04),0_18px_48px_-20px_rgb(36_26_77/0.28)]"
    >
      <div className="v2-modal-strip h-1.5" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(120%_100%_at_0%_0%,var(--color-v2-primary-light)_0%,transparent_65%)]" aria-hidden />

      <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10 lg:p-10">
        {/* ---- Name, then photos ---- */}
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-v2-primary">{NEW_ALBUM.eyebrow}</p>
            {named ? (
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
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
                className="mt-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  commit(draft);
                }}
              >
                <label className="sr-only" htmlFor={`${hintId}-name`}>
                  {NEW_ALBUM.nameLabel}
                </label>
                <div className="group flex items-center gap-2 border-b-2 border-dashed border-v2-primary/30 pb-1 transition-colors focus-within:border-solid focus-within:border-v2-primary">
                  <input
                    ref={inputRef}
                    id={`${hintId}-name`}
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
                    aria-describedby={hintId}
                    autoComplete="off"
                    enterKeyHint="done"
                    className="v2-brand-title v2-album-name-input min-w-0 flex-1 bg-transparent text-[1.75rem] leading-tight text-v2-ink outline-none placeholder:text-v2-muted/45 sm:text-4xl"
                  />
                  <Pencil className="h-5 w-5 shrink-0 text-v2-primary/50 transition group-focus-within:opacity-0" aria-hidden />
                </div>
                <p id={hintId} className="mt-2 text-sm text-v2-muted">
                  {NEW_ALBUM.nameHint}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestions().map((s) => (
                    <button
                      key={s}
                      type="button"
                      // Keep focus in the field, so picking one doesn't first save what was typed.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commit(s)}
                      className="min-h-9 rounded-full border border-v2-primary/20 bg-white px-3.5 text-sm font-medium text-v2-navy shadow-sm transition hover:border-v2-primary/50 hover:bg-v2-primary-light"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </form>
            )}
          </div>

          <V2UploadDropzone
            className="!flex-none rounded-2xl !border-v2-primary/25 !bg-v2-primary-light/50"
            onFiles={(files) => onFiles(Array.from(files))}
          >
            <div className="flex flex-col items-center gap-3 px-5 py-7 text-center sm:px-8 sm:py-9">
              <span className="v2-dropzone-icon flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-violet to-brand-blue text-white shadow-lg shadow-brand-violet/30">
                <ImagePlus className="h-7 w-7" aria-hidden />
              </span>
              <div>
                <h3 className="v2-brand-title text-xl text-v2-ink sm:text-2xl">{dropTitle}</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-v2-muted">{line}</p>
              </div>
              <button type="button" onClick={onChoose} className="v2-btn-primary v2-breathe mt-1 min-h-12 w-full max-w-xs text-base">
                <ImagePlus className="h-5 w-5" aria-hidden />
                {NEW_ALBUM.button}
              </button>
              <p className="hidden text-sm font-medium text-v2-navy pointer-fine:block">{NEW_ALBUM.dragHint}</p>
              <p className="text-xs text-v2-muted">
                {fillCopy(STUDIO_EMPTY.formats, { size: formatPhotoSizeLimit(PHOTO_UPLOAD_MAX_BYTES) })}
              </p>
            </div>
          </V2UploadDropzone>

          {guest ? (
            <p className="-mt-2 flex items-start gap-2 text-xs text-v2-muted">
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

          <div className="rounded-2xl bg-v2-bg-subtle/70 p-4 sm:p-5">
            <p className="text-sm font-semibold text-v2-ink">{BEST_PHOTOS.title}</p>
            <ul className="mt-2.5 space-y-2">
              {BEST_PHOTOS.items.map((tip) => (
                <li key={tip} className="flex items-start gap-2.5 text-sm text-v2-navy">
                  <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-v2-primary/12 text-v2-primary">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ---- What happens next ---- */}
      <footer className="relative border-t border-gray-100 bg-v2-bg/60 px-5 py-5 sm:px-8 lg:px-10">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-v2-ink">{NEW_ALBUM.stepsTitle}</h3>
          <button type="button" onClick={onHowItWorks} className="v2-hit text-sm font-semibold text-v2-link hover:underline">
            {NEW_ALBUM.guide}
          </button>
        </div>
        <ol className="mt-3 grid gap-4 sm:grid-cols-3">
          {NEW_ALBUM.steps.map((step, i) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="v2-wordmark flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm text-v2-primary shadow-sm ring-1 ring-v2-primary/15">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-v2-ink">{step.title}</span>
                <span className="block text-sm text-v2-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </footer>
    </section>
  );
}
