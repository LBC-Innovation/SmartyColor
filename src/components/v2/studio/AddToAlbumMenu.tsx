"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, FolderPlus, Images, Loader2, Plus } from "lucide-react";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { cn } from "@/lib/cn";

export type AddToAlbumOption = {
  id: string;
  name: string;
  photoCount: number;
  /** Set when someone else shared the album with this user. */
  ownerName?: string | null;
};

export type AddToAlbumDestination = { projectId: string } | { newAlbumName: string };

type Props = {
  albums: AddToAlbumOption[];
  /** The album the photo is in now: listed, but can't be picked. */
  currentAlbumId: string | null;
  disabled?: boolean;
  className: string;
  /** Resolves once the copy is in place; rejects with a message to show. */
  onAdd: (destination: AddToAlbumDestination) => Promise<void>;
};

/** Phones get a bottom sheet; wider screens a menu under the button. */
const SHEET_QUERY = "(max-width: 639px)";

/**
 * "Add this photo to ▾" in the page editor's toolbar: pick one of your albums (or start a new one)
 * and a copy of the photo, with its coloring pages, goes there.
 */
export function AddToAlbumMenu({ albums, currentAlbumId, disabled, className, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Images className="h-4 w-4" aria-hidden />
        Add this photo to
        <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} aria-hidden />
      </button>
      {open
        ? createPortal(
            <AlbumPicker
              anchorRef={buttonRef}
              albums={albums}
              currentAlbumId={currentAlbumId}
              onAdd={onAdd}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function AlbumPicker({
  anchorRef,
  albums,
  currentAlbumId,
  onAdd,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  albums: AddToAlbumOption[];
  currentAlbumId: string | null;
  onAdd: Props["onAdd"];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [sheet] = useState(() => window.matchMedia(SHEET_QUERY).matches);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  /** Which row is copying: an album id, or "new". */
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");

  // Esc closes only this menu, focus stays inside it, and focus goes back to the button after.
  useModalLayer({ panelRef, initialFocusRef: listRef, onClose: () => !working && onClose() });

  useLayoutEffect(() => {
    if (sheet) return;
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 32);
      const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16);
      setPos({ top: rect.bottom + 8, left, width });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [sheet, anchorRef]);

  useLayoutEffect(() => {
    if (naming) nameRef.current?.focus();
  }, [naming]);

  async function add(destination: AddToAlbumDestination, key: string) {
    if (working) return;
    setWorking(key);
    setError(null);
    try {
      await onAdd(destination);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the photo. Try again.");
      setWorking(null);
    }
  }

  function submitNew(e: FormEvent) {
    e.preventDefault();
    void add({ newAlbumName: newName.trim() }, "new");
  }

  const others = albums.filter((a) => a.id !== currentAlbumId);
  const current = albums.find((a) => a.id === currentAlbumId);
  const ordered = current ? [current, ...others] : others;

  const body = (
    <>
      <div
        ref={listRef}
        role="listbox"
        aria-label="Your albums"
        className={cn("overflow-y-auto overscroll-contain py-1", sheet ? "max-h-[50dvh]" : "max-h-72")}
      >
        {ordered.map((album) => {
          const here = album.id === currentAlbumId;
          const busy = working === album.id;
          return (
            <button
              key={album.id}
              type="button"
              role="option"
              aria-selected={here}
              aria-disabled={here || undefined}
              disabled={here || (working != null && !busy)}
              onClick={() => void add({ projectId: album.id }, album.id)}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition",
                here ? "cursor-default" : "hover:bg-v2-bg-subtle focus-visible:bg-v2-bg-subtle",
                "disabled:cursor-not-allowed focus-visible:outline-none",
                working != null && !busy && !here && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  here ? "bg-v2-primary-light text-v2-primary" : "bg-v2-bg-subtle text-v2-navy",
                )}
                aria-hidden
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : here ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Images className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-v2-ink">{album.name || "Untitled album"}</span>
                <span className="block truncate text-xs text-v2-muted">
                  {here
                    ? "In this album"
                    : `${album.photoCount} ${album.photoCount === 1 ? "photo" : "photos"}${album.ownerName ? ` · Shared by ${album.ownerName}` : ""}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-gray-100 p-2">
        {naming ? (
          <form className="flex flex-col gap-2 p-1" onSubmit={submitNew}>
            <label htmlFor="add-to-new-album" className="px-1 text-xs font-semibold text-v2-muted">
              New album name
            </label>
            <input
              ref={nameRef}
              id="add-to-new-album"
              className="v2-input"
              placeholder="e.g. Summer at the lake"
              maxLength={120}
              value={newName}
              disabled={working != null}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-40"
                disabled={working != null}
                onClick={() => {
                  setNaming(false);
                  setNewName("");
                }}
              >
                Cancel
              </button>
              <button type="submit" className="v2-btn-primary min-h-11 flex-1" disabled={working != null || !newName.trim()}>
                {working === "new" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                Create and add
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            disabled={working != null}
            onClick={() => setNaming(true)}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1 py-2 text-left text-sm font-semibold text-v2-link transition hover:bg-v2-primary-light/50 disabled:opacity-40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-v2-primary text-white" aria-hidden>
              {others.length === 0 ? <FolderPlus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </span>
            New album
          </button>
        )}
        {error ? (
          <p className="px-2 pb-1 pt-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );

  if (sheet) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true" aria-label="Add this photo to">
        <button type="button" tabIndex={-1} className="absolute inset-0 bg-v2-ink/40" aria-label="Close" onClick={() => !working && onClose()} />
        <div
          ref={panelRef}
          tabIndex={-1}
          className="cm-sheet-up relative w-full overflow-hidden rounded-t-3xl bg-v2-surface pb-[env(safe-area-inset-bottom)] shadow-2xl focus:outline-none"
        >
          <div className="flex justify-center pt-2" aria-hidden>
            <span className="h-1.5 w-12 rounded-full bg-gray-300" />
          </div>
          <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-1">
            <h2 className="v2-brand-title text-lg text-v2-ink">Add this photo to</h2>
            <button
              type="button"
              className="min-h-11 rounded-full px-3 text-sm font-semibold text-v2-link disabled:opacity-40"
              disabled={working != null}
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <p className="px-4 pb-2 text-xs text-v2-muted">A copy goes there with its coloring pages. This one stays put.</p>
          <div className="border-t border-gray-100">{body}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button type="button" tabIndex={-1} className="absolute inset-0 cursor-default" aria-label="Close" onClick={() => !working && onClose()} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Add this photo to"
        className="cm-fade-in absolute overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_16px_40px_rgb(10_16_26/0.16)] focus:outline-none"
        style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: "hidden" }}
      >
        <p className="border-b border-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-v2-muted">
          Add this photo to
        </p>
        {body}
      </div>
    </div>
  );
}
