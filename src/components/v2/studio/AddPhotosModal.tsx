"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ImageIcon, Info, Plus, Upload, X } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { STUDIO_EMPTY } from "@/content/marketing";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits/money";
import { fillCopy } from "@/lib/marketing/copy";
import { isAllowedPhotoFile, isHeicFile } from "@/lib/photo/heicFile";
import { formatPhotoSizeLimit, PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo/payloadBudget";

type Props = {
  /** Files already chosen (dropped on the studio) to stage when the modal opens. */
  initialFiles?: File[];
  signedIn: boolean;
  autoOn: boolean;
  onAutoChange: (on: boolean) => void;
  autoPortrait: boolean;
  onAutoPortraitChange: (on: boolean) => void;
  pagePriceCents: number | null;
  portraitPriceCents: number | null;
  onUpload: (files: File[]) => void;
  onClose: () => void;
};

const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

/** Checks a pick the way ingest would, so problems show here instead of after the upload. */
function screen(files: File[], existing: File[]): { ok: File[]; problems: string[] } {
  const seen = new Set(existing.map(fileKey));
  const ok: File[] = [];
  const problems: string[] = [];
  for (const file of files) {
    if (!isAllowedPhotoFile(file)) {
      problems.push(`"${file.name}" isn't a photo (JPG, PNG, WebP or HEIC).`);
    } else if (file.size > PHOTO_UPLOAD_MAX_BYTES) {
      problems.push(`"${file.name}" is over ${formatPhotoSizeLimit(PHOTO_UPLOAD_MAX_BYTES)}.`);
    } else if (!seen.has(fileKey(file))) {
      seen.add(fileKey(file));
      ok.push(file);
    }
  }
  return { ok, problems };
}

/** Square preview. The object URL is made and revoked with the tile; HEIC keeps the generic tile. */
function Thumb({ file }: { file: File }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const heic = isHeicFile(file);
  useEffect(() => {
    const img = imgRef.current;
    if (heic || !img) return;
    const url = URL.createObjectURL(file);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, heic]);
  return (
    <>
      <span className="absolute inset-0 flex items-center justify-center bg-v2-primary-light text-v2-primary" aria-hidden>
        <ImageIcon className="h-6 w-6" />
      </span>
      {heic ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </>
  );
}

export function AddPhotosModal({
  initialFiles,
  signedIn,
  autoOn,
  onAutoChange,
  autoPortrait,
  onAutoPortraitChange,
  pagePriceCents,
  portraitPriceCents,
  onUpload,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [initial] = useState(() => screen(initialFiles ?? [], []));
  const [files, setFiles] = useState<File[]>(initial.ok);
  const [problems, setProblems] = useState<string[]>(initial.problems);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  function stage(list: FileList | File[]) {
    const picked = Array.from(list);
    const { ok, problems: bad } = screen(picked, files);
    setProblems(bad);
    if (ok.length > 0) setFiles((prev) => [...prev, ...ok]);
  }
  function remove(file: File) {
    setFiles((prev) => prev.filter((f) => f !== file));
  }
  const openPicker = () => inputRef.current?.click();

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length) stage(e.dataTransfer.files);
  }

  const count = files.length;
  const formats = fillCopy(STUDIO_EMPTY.formats, { size: formatPhotoSizeLimit(PHOTO_UPLOAD_MAX_BYTES) });
  const pageCost = signedIn
    ? pagePriceCents != null
      ? `${formatCredits(pagePriceCents)} per page`
      : "Uses credit"
    : "Free to try";
  const portraitCost = signedIn
    ? portraitPriceCents != null
      ? `+ ${formatCredits(portraitPriceCents)} per photo`
      : null
    : "Free to try";

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-lg"
      title={<h2 className="v2-brand-title text-xl text-v2-ink">Add photos</h2>}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files?.length) stage(e.target.files);
          e.target.value = "";
        }}
      />
      <div
        className="relative space-y-5 px-5 pb-4 pt-4 sm:px-6"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {dragging && count > 0 ? (
          <div
            className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-v2-primary bg-v2-primary-light/90 text-base font-semibold text-v2-link"
            aria-hidden
          >
            Drop to add
          </div>
        ) : null}
        {/* Picker: only until something is staged; "Add more" takes over after that. */}
        {count === 0 ? (
        <div>
          {/* Touch screens: one big button for the native picker (library, camera or files). */}
          <div className="pointer-fine:hidden">
            <button type="button" onClick={openPicker} className="v2-btn-primary min-h-14 w-full text-base">
              <Upload className="h-5 w-5" aria-hidden />
              Choose photos
            </button>
          </div>
          {/* Mouse and trackpad: a drop target. */}
          <div
            className={cn(
              "hidden flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors pointer-fine:flex",
              dragging ? "border-v2-primary bg-v2-primary-light" : "border-v2-primary/30 bg-v2-primary-light/50",
            )}
          >
            <Upload className="h-7 w-7 text-v2-primary" aria-hidden />
            <p className="text-base font-semibold text-v2-ink">Drag photos here</p>
            <p className="text-sm text-v2-muted">or</p>
            <button type="button" onClick={openPicker} className="v2-btn-primary min-h-11">
              Choose from your computer
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-v2-muted">{formats}</p>
        </div>
        ) : null}

        {problems.length > 0 ? (
          <ul className="space-y-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}

        {/* Staged photos */}
        {count > 0 ? (
          <section aria-label="Photos ready to upload">
            <p className="mb-2 text-sm font-semibold text-v2-ink" role="status" aria-live="polite">
              {count} {count === 1 ? "photo" : "photos"} ready
            </p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {files.map((file) => (
                <li key={fileKey(file)} className="relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <Thumb file={file} />
                  <button
                    type="button"
                    onClick={() => remove(file)}
                    aria-label={`Remove ${file.name}`}
                    className="absolute right-0 top-0 inline-flex h-11 w-11 items-start justify-end p-1 pointer-fine:h-8 pointer-fine:w-8"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-v2-ink/70 text-white shadow">
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-v2-primary/40 text-xs font-semibold text-v2-link transition hover:bg-v2-primary-light"
                >
                  <Plus className="h-5 w-5" aria-hidden />
                  Add more
                </button>
              </li>
            </ul>
            <p className="mt-2 text-xs text-v2-muted">{formats}</p>
          </section>
        ) : (
          <p className="sr-only" role="status" aria-live="polite">
            No photos chosen yet
          </p>
        )}

        {/* Options */}
        <section aria-labelledby="add-photos-options">
          <h3 id="add-photos-options" className="mb-1 text-xs font-semibold uppercase tracking-wider text-v2-muted">
            Upload options
          </h3>
          <div className="divide-y divide-gray-100">
            <SwitchRow
              label="Generate coloring pages"
              hint="Turn each photo into a coloring page as it uploads"
              cost={pageCost}
              on={autoOn}
              onChange={onAutoChange}
            />
            <SwitchRow
              label="Convert landscape to portrait"
              hint="Wide photos are extended to fill a tall page"
              cost={portraitCost}
              on={autoPortrait}
              onChange={onAutoPortraitChange}
              info="Portrait photos work better in a printed book: book pages are tall, so wide photos print small with big empty bands. Converting fills the page."
            />
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-gray-200 bg-v2-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onClose} className="v2-btn-outline min-h-11">
          Cancel
        </button>
        {count > 0 ? (
          <button type="button" onClick={() => onUpload(files)} className="v2-btn-primary min-h-11 w-full sm:w-auto">
            Upload {count} {count === 1 ? "photo" : "photos"}
          </button>
        ) : null}
      </div>
    </V2Modal>
  );
}

function SwitchRow({
  label,
  hint,
  cost,
  on,
  onChange,
  info,
}: {
  label: string;
  hint: string;
  cost: string | null;
  on: boolean;
  onChange: (on: boolean) => void;
  info?: string;
}) {
  const id = useId();
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div>
      <div
        className="flex min-h-14 cursor-pointer items-center gap-2 py-2"
        onClick={(e) => {
          // Buttons handle themselves; the rest of the row is one big switch.
          if ((e.target as HTMLElement).closest("button")) return;
          onChange(!on);
        }}
      >
        <div className="min-w-0 flex-1">
          <p id={`${id}-label`} className="text-sm font-semibold text-v2-ink">
            {label}
          </p>
          <p id={`${id}-hint`} className="text-xs text-v2-muted">
            {hint}
            {cost ? <span className="font-semibold text-v2-navy"> · {cost}</span> : null}
          </p>
        </div>
        {info ? (
          <InfoTip
            id={`${id}-info`}
            text={info}
            open={infoOpen}
            onToggle={() => setInfoOpen((v) => !v)}
            onDismiss={() => setInfoOpen(false)}
          />
        ) : null}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          onClick={() => onChange(!on)}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
            on ? "border-v2-primary bg-v2-primary" : "border-gray-300 bg-white",
          )}
        >
          <span
            className={cn(
              "absolute h-5 w-5 rounded-full shadow-sm transition-transform motion-reduce:transition-none",
              on ? "translate-x-6 bg-white" : "translate-x-1 bg-gray-300",
            )}
          />
        </button>
      </div>
      {info ? (
        <p
          id={`${id}-info`}
          hidden={!infoOpen}
          className="mb-2 rounded-lg bg-v2-primary-light/70 px-3 py-2 text-xs leading-snug text-v2-navy"
        >
          {info}
        </p>
      ) : null}
    </div>
  );
}

/** Hover/focus tooltip for mouse users; tapping the icon toggles the inline callout (all devices). */
function InfoTip({
  id,
  text,
  open,
  onToggle,
  onDismiss,
}: {
  id: string;
  text: string;
  open: boolean;
  onToggle: () => void;
  onDismiss: () => void;
}) {
  const [tip, setTip] = useState(false);
  const tipId = `${id}-tip`;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && (tip || open)) {
      e.stopPropagation();
      setTip(false);
      onDismiss();
    }
  }
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-label="Why portrait?"
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={tip && !open ? tipId : undefined}
        onClick={() => {
          onToggle();
          setTip(false);
        }}
        onPointerEnter={(e) => e.pointerType === "mouse" && setTip(true)}
        onPointerLeave={() => setTip(false)}
        onFocus={() => setTip(true)}
        onBlur={() => setTip(false)}
        onKeyDown={onKeyDown}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-v2-muted transition hover:bg-v2-bg-subtle hover:text-v2-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-primary"
      >
        <Info className="h-[18px] w-[18px]" aria-hidden />
      </button>
      {tip && !open ? (
        <span
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 z-10 mb-1 hidden w-64 rounded-lg bg-v2-ink px-3 py-2 text-xs leading-snug text-white shadow-lg pointer-fine:block"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
