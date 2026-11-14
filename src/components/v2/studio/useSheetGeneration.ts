"use client";

import { useCallback, useState } from "react";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import type { useSheetUsageCredits } from "@/components/v2/credits/useSheetUsageCredits";
import type { SheetEditMessage } from "@/components/v2/V2SheetEditChat";
import type { PhotoLocks } from "@/components/v2/studio/usePhotoLocks";
import { authedFetch } from "@/lib/api/client";
import { friendlyRequestError } from "@/lib/api/networkError";
import { guestLimitScope, type GuestLimitScope } from "@/lib/guestLimit";
import type { LibraryPhoto } from "@/lib/library/types";
import { prepareSheetDataUrlForApi } from "@/lib/photo/compressImageDataUrl";
import { applyQuickFix, quickFixTitle, type QuickFixKind } from "@/lib/photo/sheetQuickFixes";
import { PHOTO_MAX_CORRECTION_CHARS } from "@/lib/session/photoTypes";
import type { GeneratedSheet, SheetVersion } from "@/lib/session/types";
import { trackPageGenerated } from "@/lib/track";
import { entryFromLibraryPhoto, uploadRevisionToLibrary } from "@/lib/v2/cloudLibrary";
import { activePageVersion, pagePrintPrefs, pageSourceVersion } from "@/components/v2/studio/order/galleryBookPages";
import {
  normalizeV2SheetRevisions,
  photoPrintPrefs,
  type V2PhotoEntry,
} from "@/lib/v2/studioTypes";

/**
 * What one drawing attempt came to. "limit" and "credit" stop a batch: the guest hit today's free
 * pages, or the wallet ran short (the add-credit dialog is open by then).
 */
export type GenerateOutcome =
  | { kind: "success" }
  | { kind: "skipped" }
  | { kind: "failed"; message: string }
  | { kind: "limit"; scope: GuestLimitScope }
  | { kind: "credit" };

export type GenerateOptions = {
  /** Draw from this portrait version instead of the uploaded photo. */
  source?: SheetVersion;
  /** Draw again from the photo even though the photo already has a page. */
  addVersion?: boolean;
};

type Payload = {
  sheet?: GeneratedSheet;
  photo?: LibraryPhoto;
  error?: string;
  code?: string;
  creditsBalanceCents?: number;
};

function newVersion(sheet: GeneratedSheet, extra?: Partial<SheetVersion>): SheetVersion {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), sheet, ...extra };
}

/** A new version keeps the shape of the one it came from, and the photo version it was drawn from. */
function lineageOf(version: SheetVersion | null): Pick<SheetVersion, "orientation" | "sourceRevisionId"> {
  return {
    ...(version?.orientation ? { orientation: version.orientation } : {}),
    ...(version?.sourceRevisionId ? { sourceRevisionId: version.sourceRevisionId } : {}),
  };
}

/**
 * Everything that changes a coloring page: drawing it (the paid model call), editing it with a
 * note (paid), and the free quick fixes. Every operation takes the photo's own lock, so one photo
 * never has two at once while other photos stay free.
 */
export function useSheetGeneration({
  sheetCredits,
  locks,
  onGuestLimit,
}: {
  sheetCredits: ReturnType<typeof useSheetUsageCredits>;
  locks: PhotoLocks;
  onGuestLimit: (scope: GuestLimitScope, kind: "page" | "edit") => void;
}) {
  const toast = useV2Toast();
  const { photosRef, mutatePhotos, updatePhoto } = useV2Studio();
  const [editMessages, setEditMessages] = useState<SheetEditMessage[]>([]);

  const setGenerating = useCallback(
    (photoId: string, generating: boolean) =>
      mutatePhotos((prev) => prev.map((entry) => (entry.id === photoId ? { ...entry, generating } : entry))),
    [mutatePhotos],
  );

  async function generateForPhoto(photoId: string, options?: GenerateOptions): Promise<GenerateOutcome> {
    const photo = photosRef.current.find((entry) => entry.id === photoId);
    const source = options?.source ?? null;
    if (!photo || (activePageVersion(photo) && !source && !options?.addVersion)) return { kind: "skipped" };
    if (photo.generating || photo.correcting || !locks.acquire(photoId)) return { kind: "skipped" };
    if (!sheetCredits.canAfford("generation", photo)) {
      locks.release(photoId);
      return { kind: "credit" };
    }
    setGenerating(photoId, true);

    try {
      const response = await authedFetch(
        "/api/photo-coloring",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            photo.remote
              ? {
                  mode: "generate-library",
                  photoId: photo.remote.photoId,
                  ...(source ? { sourceRevisionId: source.id } : {}),
                }
              : source
                ? {
                    mode: "generate",
                    photoDataUrl: source.sheet.imageDataUrl,
                    printPrefs: { ...photo.printPrefs, orientation: source.orientation ?? "portrait" },
                  }
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
      const rawBody = await response.text();
      let payload: Payload;
      try {
        payload = JSON.parse(rawBody) as Payload;
      } catch {
        throw new Error("The server sent an unexpected response. Please try again in a moment.");
      }
      const limit = guestLimitScope(response.status, payload.code);
      if (limit) {
        setGenerating(photoId, false);
        return { kind: "limit", scope: limit };
      }
      if (sheetCredits.applyResponse(response.status, payload, "generation")) {
        setGenerating(photoId, false);
        return { kind: "credit" };
      }
      if (!response.ok) throw new Error(payload.error ?? "Could not make a coloring page.");

      if (payload.photo) {
        const fresh = await entryFromLibraryPhoto(payload.photo);
        // Functional update, so pages finishing in the same tick never overwrite each other.
        mutatePhotos((prev) =>
          prev.map((entry) => (entry.id === photoId ? { ...fresh, printPrefs: entry.printPrefs } : entry)),
        );
      } else {
        if (!payload.sheet) throw new Error("No coloring page came back.");
        const sheet = payload.sheet;
        const revision = newVersion(
          sheet,
          source ? { orientation: source.orientation ?? "portrait", sourceRevisionId: source.id } : undefined,
        );
        mutatePhotos((prev) =>
          prev.map((entry) =>
            entry.id === photoId
              ? {
                  ...entry,
                  sheet,
                  sheetRevisions: [...normalizeV2SheetRevisions(entry), revision],
                  activeRevisionId: revision.id,
                  generating: false,
                }
              : entry,
          ),
        );
      }
      trackPageGenerated(Boolean(photo.remote));
      return { kind: "success" };
    } catch (err) {
      setGenerating(photoId, false);
      return { kind: "failed", message: friendlyRequestError(err, "Something went wrong.") };
    } finally {
      locks.release(photoId);
    }
  }

  function startEditChat() {
    setEditMessages((current) =>
      current.length > 0
        ? current
        : [
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: "Tell me what to adjust on this page. I'll change only what you describe.",
            },
          ],
    );
  }

  function resetEditChat() {
    setEditMessages([]);
  }

  async function applySheetEdit(photoId: string, note: string) {
    const photo = photosRef.current.find((entry) => entry.id === photoId);
    if (!photo) return;
    // The edit applies to the page on show, with the photo that page was drawn from.
    const active = activePageVersion(photo);
    if (!active) return;
    const sourceVersion = pageSourceVersion(photo);
    const lineage = lineageOf(active);

    const trimmed = note.trim();
    if (!trimmed) return;
    if (trimmed.length > PHOTO_MAX_CORRECTION_CHARS) {
      toast.error(`Keep each edit note under ${PHOTO_MAX_CORRECTION_CHARS} characters.`);
      return;
    }
    if (photo.generating || photo.correcting || !locks.acquire(photoId)) return;
    if (!sheetCredits.canAfford("edit", photo)) {
      locks.release(photoId);
      return;
    }

    const pendingId = crypto.randomUUID();
    setEditMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text: trimmed },
      { id: pendingId, role: "assistant", text: "Applying your change to the page…", pending: true },
    ]);
    updatePhoto(photoId, { correcting: true });
    let quiet = false;

    try {
      let body: Record<string, unknown>;
      if (photo.remote) {
        body = { mode: "correct-library", photoId: photo.remote.photoId, revisionId: active.id, corrections: [trimmed] };
      } else {
        const sheetDataUrl = await prepareSheetDataUrlForApi(active.sheet.imageDataUrl, 2);
        body = {
          mode: "correct",
          photoDataUrl: sourceVersion?.sheet.imageDataUrl ?? photo.photoDataUrl,
          sheetDataUrl,
          corrections: [trimmed],
          printPrefs: pagePrintPrefs(photo),
          image: sourceVersion ? undefined : photo.image,
        };
      }
      const response = await authedFetch(
        "/api/photo-coloring",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        { withAuth: Boolean(photo.remote) },
      );
      const payload = (await response.json()) as Payload;
      const limit = guestLimitScope(response.status, payload.code);
      if (limit) {
        quiet = true; // the modal explains; no extra toast
        onGuestLimit(limit, "edit");
      } else {
        quiet = sheetCredits.applyResponse(response.status, payload, "edit");
      }
      if (!response.ok) throw new Error(payload.error ?? "Could not apply that edit.");

      if (payload.photo) {
        const fresh = await entryFromLibraryPhoto(payload.photo);
        mutatePhotos((prev) =>
          prev.map((entry) =>
            entry.id === photoId ? { ...fresh, printPrefs: entry.printPrefs, correcting: false } : entry,
          ),
        );
      } else {
        if (!payload.sheet) throw new Error("No updated page came back.");
        const sheet = payload.sheet;
        const revision = newVersion(sheet, lineage);
        mutatePhotos((prev) =>
          prev.map((entry) =>
            entry.id === photoId
              ? {
                  ...entry,
                  sheet,
                  sheetRevisions: [...normalizeV2SheetRevisions(entry), revision],
                  activeRevisionId: revision.id,
                  correcting: false,
                }
              : entry,
          ),
        );
      }
      setEditMessages((prev) =>
        prev.map((message) =>
          message.id === pendingId
            ? { ...message, pending: false, done: true, text: "Updated! Check the coloring page for your change." }
            : message,
        ),
      );
    } catch (err) {
      updatePhoto(photoId, { correcting: false });
      const message = friendlyRequestError(err, "Could not apply that edit.");
      if (!quiet) toast.error(message);
      setEditMessages((prev) =>
        prev.map((entry) => (entry.id === pendingId ? { ...entry, pending: false, text: message } : entry)),
      );
    } finally {
      locks.release(photoId);
    }
  }

  /**
   * A free fix drawn on a canvas, saved as a new version so the versions strip doubles as undo.
   * Returns the version that was showing before, so the caller can offer to go back to it.
   */
  async function applyQuickFixVersion(photoId: string, kind: QuickFixKind): Promise<string | null> {
    const photo = photosRef.current.find((entry) => entry.id === photoId);
    if (!photo) return null;
    const active = activePageVersion(photo);
    if (!active) return null;
    if (photo.generating || photo.correcting || !locks.acquire(photoId)) return null;
    try {
      const imageDataUrl = await applyQuickFix(active.sheet.imageDataUrl, kind);
      const sheet: GeneratedSheet = {
        title: quickFixTitle(active.sheet.title, kind),
        imageDataUrl,
        mimeType: "image/png",
      };
      const lineage = lineageOf(active);
      if (photo.remote) {
        const stored = await uploadRevisionToLibrary({ photoId: photo.remote.photoId, sheet, meta: lineage });
        const fresh = await entryFromLibraryPhoto(stored);
        mutatePhotos((prev) =>
          prev.map((entry) => (entry.id === photoId ? { ...fresh, printPrefs: entry.printPrefs } : entry)),
        );
      } else {
        const revision = newVersion(sheet, lineage);
        mutatePhotos((prev) =>
          prev.map((entry) =>
            entry.id === photoId
              ? {
                  ...entry,
                  sheet,
                  sheetRevisions: [...normalizeV2SheetRevisions(entry), revision],
                  activeRevisionId: revision.id,
                }
              : entry,
          ),
        );
      }
      return active.id;
    } catch (err) {
      toast.error(friendlyRequestError(err, "Could not change that page."));
      return null;
    } finally {
      locks.release(photoId);
    }
  }

  function selectRevision(photoId: string, revisionId: string) {
    const entry = photosRef.current.find((item) => item.id === photoId);
    if (!entry) return;
    const revisions = normalizeV2SheetRevisions(entry);
    const picked = revisions.find((item) => item.id === revisionId);
    if (!picked) return;
    updatePhoto(photoId, { sheetRevisions: revisions, activeRevisionId: revisionId, sheet: picked.sheet });
  }

  /** Saves the page's place in the book with the photo (cloud: through its print preferences). */
  function setBookPrefs(photoId: string, patch: Partial<NonNullable<V2PhotoEntry["printPrefs"]["book"]>>) {
    const entry = photosRef.current.find((item) => item.id === photoId);
    if (!entry) return;
    const printPrefs = { ...entry.printPrefs, book: { ...entry.printPrefs.book, ...patch } };
    updatePhoto(photoId, { printPrefs });
  }

  return {
    generateForPhoto,
    applySheetEdit,
    applyQuickFixVersion,
    selectRevision,
    setBookPrefs,
    editMessages,
    startEditChat,
    resetEditChat,
  };
}
