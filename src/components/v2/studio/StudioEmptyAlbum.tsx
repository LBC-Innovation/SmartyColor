"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CalendarHeart, Check, ImagePlus, MessageSquareText, Palette, Pencil, ShieldCheck, Sparkles } from "lucide-react";
import { BOOK_PACKAGES, DESIGN_THEMES, NEW_ALBUM, STUDIO_EMPTY } from "@/content/marketing";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import type { AlbumPurchaseCode } from "@/lib/purchaseCodes/types";
import { V2UploadDropzone } from "@/components/v2/V2UploadDropzone";
import { PLACEHOLDER_ALBUM_NAME, isAutomaticAlbumName } from "@/components/v2/studio/albumNames";
import { isThemeDecided, markThemeDecided } from "@/components/v2/studio/themeDecided";
import { cn } from "@/lib/cn";
import { fillCopy } from "@/lib/marketing/copy";
import { formatPhotoSizeLimit, PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo/payloadBudget";

/** Album names are capped here, as in the album menu's rename field. */
const NAME_MAX = 80;

type Props = {
  albumId: string;
  albumName: string;
  /** False for an album someone shared with you: only its owner names it. */
  canRename: boolean;
  onRename: (name: string) => void;
  /** Opens the photo picker. */
  onChoose: () => void;
  onFiles: (files: File[]) => void;
  onHowItWorks: () => void;
  /** The line under the photo step (landing-page visitors get their own). */
  line: string;
  /** Signed out: photos stay on this device, so say so. */
  guest: boolean;
  /** The album's design theme. Null when themes aren't available here (guests). */
  theme: { value: string | null; canEdit: boolean; onEdit: () => void } | null;
  /** The album holds a book package: what it includes and how many photos are left. */
  pkg?: { code: AlbumPurchaseCode; photosLeft: number } | null;
  /** The home page's year album: offer that year's photos first. */
  yearPhotos?: { year: number; onOpen: () => void } | null;
};

type StepId = "theme" | "name" | "photos";
type StepState = "done" | "active" | "upcoming";

function suggestions(): string[] {
  const year = String(new Date().getFullYear());
  return NEW_ALBUM.suggestions.map((s) => s.replace("{year}", year));
}

/**
 * What a brand-new, empty album shows: a short guided setup, one step at a time. Choose a theme
 * (optional, and only where themes exist), name the album, then add its first photos. Finished
 * steps fold into one line with a Change link, and a step opens only once the one before it is
 * answered (chosen, saved or skipped). Beside it (below on phones), a step-by-step guide to the app.
 * Give it `key={albumId}`, so opening another empty album starts over.
 */
export function StudioEmptyAlbum({
  albumId,
  albumName,
  canRename,
  onRename,
  onChoose,
  onFiles,
  onHowItWorks,
  line,
  guest,
  theme,
  pkg,
  yearPhotos,
}: Props) {
  // ---- Theme ----
  const showTheme = theme != null && (theme.canEdit || theme.value != null);
  const [themeSkipped, setThemeSkipped] = useState(() => isThemeDecided(albumId));
  const themeDone = !showTheme || theme?.value != null || themeSkipped || !theme?.canEdit;

  // ---- Name ----
  const automatic = canRename && isAutomaticAlbumName(albumName);
  const [renaming, setRenaming] = useState(false);
  const [nameSkipped, setNameSkipped] = useState(false);
  // A placeholder ("Album 3") starts the field empty; a made-up name ("Gift book") is kept to edit.
  const [draft, setDraft] = useState(() => (PLACEHOLDER_ALBUM_NAME.test(albumName.trim()) ? "" : albumName));
  const [saved, setSaved] = useState(false);
  const nameDone = !renaming && (!automatic || nameSkipped);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const active: StepId = !themeDone ? "theme" : !nameDone ? "name" : "photos";

  // The name field takes focus when its step opens. Not on touch screens: the keyboard would
  // cover the page before the person has seen it.
  useEffect(() => {
    if (active !== "name") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [active]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(timer);
  }, [saved]);

  function commitName(value: string) {
    const name = value.trim().slice(0, NAME_MAX);
    if (!name) return;
    setDraft(name);
    setRenaming(false);
    if (name !== albumName) {
      onRename(name);
      setSaved(true);
    }
  }

  function skipTheme() {
    markThemeDecided(albumId);
    setThemeSkipped(true);
  }

  // ---- Package ----
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
  const photosLine = pkgTokens
    ? (fillPackageCopy(pkgUsedUp ? BOOK_PACKAGES.landingPickNone : BOOK_PACKAGES.landingPick, pkgTokens) ?? line)
    : line;
  const eyebrow = pkgTokens ? fillPackageCopy(NEW_ALBUM.setupEyebrowBook, pkgTokens) : NEW_ALBUM.setupEyebrow;
  const title = pkgTokens ? (fillPackageCopy(NEW_ALBUM.setupTitleBook, pkgTokens) ?? NEW_ALBUM.setupTitle) : NEW_ALBUM.setupTitle;

  const order: StepId[] = showTheme ? ["theme", "name", "photos"] : ["name", "photos"];
  const stateOf = (id: StepId): StepState => {
    if (id === active) return "active";
    const done = id === "theme" ? themeDone : id === "name" ? nameDone : false;
    return done ? "done" : "upcoming";
  };

  return (
    <section
      aria-label={title}
      className="mx-auto grid w-full max-w-6xl gap-12 pb-10 pt-2 sm:pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16 lg:pt-8 xl:gap-24"
    >
        {/* ---- The setup ---- */}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-v2-primary">{eyebrow}</p>
          <h2 className="v2-brand-title mt-2 text-[1.9rem] leading-[1.1] text-v2-ink sm:text-[2.5rem]">{title}</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-v2-muted sm:text-[0.95rem]">{NEW_ALBUM.setupSub}</p>

          <ol className="mt-8 max-w-2xl sm:mt-10">
            {order.map((id, i) => {
              const state = stateOf(id);
              const n = i + 1;
              const last = i === order.length - 1;
              if (id === "theme" && theme) {
                return (
                  <Step
                    key={id}
                    n={n}
                    state={state}
                    last={last}
                    title={state === "done" ? NEW_ALBUM.stepThemeDone : NEW_ALBUM.stepTheme}
                    badge={state === "active" ? NEW_ALBUM.stepThemeOptional : undefined}
                    action={state === "done" && theme.canEdit ? { label: NEW_ALBUM.change, onClick: theme.onEdit } : undefined}
                    summary={
                      theme.value ? (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Palette className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
                          <span className="truncate" title={theme.value}>
                            {theme.value}
                          </span>
                        </span>
                      ) : (
                        <span className="truncate">
                          {NEW_ALBUM.stepThemeNone}
                          <span className="text-v2-muted"> · {NEW_ALBUM.stepThemeNoneSub}</span>
                        </span>
                      )
                    }
                  >
                    <ThemeAsk onAdd={theme.onEdit} onSkip={skipTheme} />
                  </Step>
                );
              }
              if (id === "name") {
                return (
                  <Step
                    key={id}
                    n={n}
                    state={state}
                    last={last}
                    title={state === "done" ? NEW_ALBUM.stepNameDone : NEW_ALBUM.stepName}
                    action={
                      state === "done" && canRename
                        ? {
                            label: NEW_ALBUM.rename,
                            onClick: () => {
                              setDraft(automatic && PLACEHOLDER_ALBUM_NAME.test(albumName.trim()) ? "" : albumName);
                              setRenaming(true);
                              requestAnimationFrame(() => inputRef.current?.select());
                            },
                          }
                        : undefined
                    }
                    summary={
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{albumName}</span>
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
                      </span>
                    }
                  >
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitName(draft);
                      }}
                    >
                      <label className="sr-only" htmlFor={inputId}>
                        {NEW_ALBUM.nameLabel}
                      </label>
                      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 shadow-[inset_0_1px_2px_rgb(10_16_26/0.04)] transition focus-within:border-v2-primary focus-within:ring-4 focus-within:ring-v2-primary/10">
                        <input
                          ref={inputRef}
                          id={inputId}
                          value={draft}
                          maxLength={NAME_MAX}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Escape" || automatic) return;
                            setDraft(albumName);
                            setRenaming(false);
                          }}
                          placeholder={NEW_ALBUM.namePlaceholder}
                          autoComplete="off"
                          enterKeyHint="done"
                          className="v2-album-name-input min-h-12 min-w-0 flex-1 bg-transparent text-base font-semibold text-v2-ink outline-none placeholder:font-normal placeholder:text-v2-muted/60 sm:text-lg"
                        />
                        <Pencil className="h-4 w-4 shrink-0 text-v2-primary/40" aria-hidden />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {suggestions().map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => commitName(s)}
                            className="min-h-9 rounded-full border border-gray-200 bg-white px-3.5 text-sm text-v2-navy transition hover:border-v2-primary/40 hover:bg-v2-primary-light hover:text-v2-primary"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <button
                          type="submit"
                          disabled={!draft.trim()}
                          className="v2-btn-primary min-h-11 px-6 text-sm disabled:opacity-50"
                        >
                          {NEW_ALBUM.stepNameNext}
                        </button>
                        {automatic ? (
                          <button
                            type="button"
                            onClick={() => {
                              setNameSkipped(true);
                              setRenaming(false);
                            }}
                            className="v2-hit min-h-11 text-sm font-semibold text-v2-muted hover:text-v2-ink"
                          >
                            {NEW_ALBUM.stepNameSkip}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDraft(albumName);
                              setRenaming(false);
                            }}
                            className="v2-hit min-h-11 text-sm font-semibold text-v2-muted hover:text-v2-ink"
                          >
                            {NEW_ALBUM.cancel}
                          </button>
                        )}
                      </div>
                    </form>
                  </Step>
                );
              }
              return (
                <Step key={id} n={n} state={state} last={last} title={NEW_ALBUM.stepPhotos}>
                  <PhotosStep
                    yearPhotos={yearPhotos ?? null}
                    line={photosLine}
                    onChoose={onChoose}
                    onFiles={onFiles}
                  />
                  {guest ? (
                    <p className="mt-3 flex items-start gap-2 text-xs text-v2-muted">
                      <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
                      {STUDIO_EMPTY.guestNote}
                    </p>
                  ) : null}
                </Step>
              );
            })}
          </ol>
        </div>

        {/* ---- How the app works, start to finish ---- */}
        <HowItWorksGuide onMore={onHowItWorks} />
    </section>
  );
}

/** One row of the setup: a numbered marker on a rail, a title, and either its body or a summary. */
function Step({
  n,
  state,
  last,
  title,
  badge,
  action,
  summary,
  children,
}: {
  n: number;
  state: StepState;
  last: boolean;
  title: string;
  badge?: string;
  action?: { label: string; onClick: () => void };
  summary?: ReactNode;
  children: ReactNode;
}) {
  const open = state === "active";
  return (
    <li aria-current={state === "active" ? "step" : undefined} className={cn("relative flex gap-4", !last && "pb-7")}>
      {!last ? (
        <span
          aria-hidden
          className={cn(
            "absolute bottom-1 left-[15px] top-10 w-0.5 rounded-full",
            state === "done" ? "bg-v2-primary/35" : "bg-gray-200",
          )}
        />
      ) : null}
      <span
        aria-hidden
        className={cn(
          "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition",
          state === "done" && "bg-v2-primary text-white",
          state === "active" && "bg-v2-primary text-white ring-4 ring-v2-primary/15",
          state === "upcoming" && "border-2 border-gray-200 bg-white text-gray-400",
        )}
      >
        {state === "done" ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-8 items-center gap-2">
          <h3
            className={cn(
              "min-w-0 text-base font-semibold",
              state === "upcoming" ? "text-v2-muted" : state === "done" ? "text-sm font-medium text-v2-muted" : "text-v2-ink",
            )}
          >
            {title}
            {state === "done" ? <span className="sr-only"> (done)</span> : null}
          </h3>
          {badge ? (
            <span className="rounded-full bg-v2-bg-subtle px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-v2-muted">
              {badge}
            </span>
          ) : null}
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="v2-hit-y ml-auto shrink-0 text-sm font-semibold text-v2-link hover:underline"
            >
              {action.label}
            </button>
          ) : null}
        </div>
        {state === "done" && summary ? (
          <div className="-mt-0.5 min-w-0 text-[0.95rem] font-semibold text-v2-ink">{summary}</div>
        ) : null}
        {open ? <div className="mt-3">{children}</div> : null}
      </div>
    </li>
  );
}

/** The theme step's question: a glimpse of a real theme, then "Add a theme" or "No theme". */
function ThemeAsk({ onAdd, onSkip }: { onAdd: () => void; onSkip: () => void }) {
  const pair = DESIGN_THEMES.examples.pairs[0];
  return (
    <div>
      <p className="max-w-md text-sm leading-relaxed text-v2-muted">{NEW_ALBUM.stepThemeAsk}</p>
      {pair ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-gray-100 bg-v2-bg-subtle/60 p-2.5 pr-4">
          <div className="flex shrink-0 items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pair.photo} alt="" loading="lazy" className="h-16 w-12 rounded-lg object-cover" />
            <ArrowRight className="h-3.5 w-3.5 text-v2-primary" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pair.page}
              alt={pair.alt}
              loading="lazy"
              className="h-16 w-12 rounded-lg border border-gray-200 bg-white object-contain"
            />
          </div>
          <p className="min-w-0 text-xs leading-snug text-v2-muted">
            {fillPackageCopy(DESIGN_THEMES.examplesTheme, { theme: DESIGN_THEMES.examples.theme })}
          </p>
        </div>
      ) : null}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
        <button type="button" onClick={onAdd} className="v2-btn-primary min-h-11 whitespace-nowrap px-4 text-sm">
          <Palette className="h-4 w-4" aria-hidden />
          {NEW_ALBUM.stepThemeAdd}
        </button>
        <button type="button" onClick={onSkip} className="v2-btn-outline min-h-11 whitespace-nowrap px-4 text-sm">
          {NEW_ALBUM.stepThemeSkip}
        </button>
      </div>
    </div>
  );
}

/** The photo step: a drop area with the picker button. */
function PhotosStep({
  yearPhotos,
  line,
  onChoose,
  onFiles,
}: {
  yearPhotos: { year: number; onOpen: () => void } | null;
  line: string;
  onChoose: () => void;
  onFiles: (files: File[]) => void;
}) {
  return (
    <V2UploadDropzone
      className={cn(
        "!flex-none rounded-2xl transition",
        "!border-v2-primary/25 !bg-v2-primary-light/40",
      )}
      onFiles={(files) => onFiles(Array.from(files))}
    >
      <div className="flex flex-col items-center px-5 py-7 text-center sm:px-8 sm:py-9">
        <span
          aria-hidden
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl",
            "bg-white text-v2-primary shadow-sm",
          )}
        >
          <ImagePlus className="h-6 w-6" />
        </span>
        <p className="mx-auto mt-3 max-w-xs text-sm text-v2-muted">
          {yearPhotos ? fillPackageCopy(NEW_ALBUM.yearPhotosLine, { year: yearPhotos.year }) : line}
        </p>
        {yearPhotos ? (
          <button type="button" onClick={yearPhotos.onOpen} className="v2-btn-primary v2-radiate mt-5 min-h-12 w-full max-w-xs text-base">
            <CalendarHeart className="h-5 w-5" aria-hidden />
            {fillPackageCopy(NEW_ALBUM.yearPhotosButton, { year: yearPhotos.year })}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onChoose}
          className={cn(
            "min-h-12 w-full max-w-xs text-base",
            yearPhotos ? "v2-btn-outline mt-2.5" : "v2-btn-primary v2-radiate mt-5",
          )}
        >
          <ImagePlus className="h-5 w-5" aria-hidden />
          {yearPhotos ? NEW_ALBUM.yearPhotosOther : NEW_ALBUM.button}
        </button>
        <p className="mt-3 text-xs text-v2-muted">
          <span className="hidden pointer-fine:inline">{NEW_ALBUM.dragHint}, </span>
          {fillCopy(NEW_ALBUM.sizeLimit, { size: formatPhotoSizeLimit(PHOTO_UPLOAD_MAX_BYTES) })}
        </p>
      </div>
    </V2UploadDropzone>
  );
}

/**
 * How the app works, start to finish: four numbered steps, each with a picture of what happens.
 * Beside the setup on wide screens, below it on phones.
 */
function HowItWorksGuide({ onMore }: { onMore: () => void }) {
  const visuals: ReactNode[] = [
    // eslint-disable-next-line @next/next/no-img-element
    <img key="photo" src="/marketing/hero-photo-400.webp" alt="" className="h-full w-full object-cover" />,
    // eslint-disable-next-line @next/next/no-img-element
    <img key="page" src="/marketing/hero-sheet-400.webp" alt="" className="h-full w-full object-cover" />,
    <span key="edit" className="flex h-full w-full items-center justify-center bg-v2-primary-light text-v2-primary">
      <MessageSquareText className="h-6 w-6" />
    </span>,
    // eslint-disable-next-line @next/next/no-img-element
    <img key="book" src="/marketing/binding-paperback.webp" alt="" className="h-full w-full object-cover" />,
  ];
  return (
    <aside
      aria-labelledby="how-it-works-title"
      className="min-w-0 border-t border-gray-200 pt-10 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-1 xl:pl-14"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-v2-muted">{NEW_ALBUM.guideEyebrow}</p>
      <h2 id="how-it-works-title" className="v2-brand-title mt-2 text-xl leading-tight text-v2-ink">
        {NEW_ALBUM.guideTitle}
      </h2>
      <ol className="mt-6">
        {NEW_ALBUM.guideSteps.map((step, i) => {
          const last = i === NEW_ALBUM.guideSteps.length - 1;
          return (
            <li key={step.title} className={cn("relative flex gap-4", !last && "pb-6")}>
              {!last ? <span aria-hidden className="absolute bottom-0 left-7 top-16 w-px bg-gray-200" /> : null}
              <span className="relative h-14 w-14 shrink-0" aria-hidden>
                <span className="block h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  {visuals[i]}
                </span>
                <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-v2-ink text-[11px] font-bold text-white ring-2 ring-v2-bg">
                  {i + 1}
                </span>
              </span>
              <div className="min-w-0 pt-0.5">
                <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-v2-ink">
                  {step.title}
                  {i === 1 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-v2-plum px-2 py-0.5 text-[11px] font-semibold text-white">
                      <Sparkles className="h-3 w-3 text-brand-amber" aria-hidden />
                      {NEW_ALBUM.exampleTime}
                    </span>
                  ) : null}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-v2-muted">{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={onMore}
        className="v2-hit mt-6 inline-flex items-center gap-1 text-sm font-semibold text-v2-link hover:underline"
      >
        {NEW_ALBUM.guideMore}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </aside>
  );
}
