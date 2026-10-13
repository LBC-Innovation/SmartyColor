"use client";

import { useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import type { useSheetUsageCredits } from "@/components/v2/credits/useSheetUsageCredits";
import { authedFetch } from "@/lib/api/client";
import * as library from "@/lib/library/client";
import type { LibraryPhoto } from "@/lib/library/types";
import { compressImageDataUrlForApi } from "@/lib/photo/compressImageDataUrl";
import { dataUrlToBlob } from "@/lib/photo/dataUrlBlob";
import { mirrorImageDataUrl } from "@/lib/photo/mirrorImageDataUrl";
import {
  estimateDataUrlRawBytes,
  maxRawBytesPerImageInRequest,
} from "@/lib/photo/payloadBudget";
import { PORTRAIT_VERSION_TITLE, type GeneratedPhoto } from "@/lib/session/photoTypes";
import type { SheetVersion } from "@/lib/session/types";
import { entryFromLibraryPhoto, evictEntryImages } from "@/lib/v2/cloudLibrary";
import { mirrorPhotoCrop } from "@/lib/v2/storybookTypes";
import {
  normalizeV2SheetRevisions,
  photoOrientation,
  type V2PhotoEntry,
} from "@/lib/v2/studioTypes";

type PhotoTransformOptions = {
  sheetCredits: ReturnType<typeof useSheetUsageCredits>;
  /** Shared with sheet generation, so a photo never changes under a sheet being drawn from it. */
  lockRef: RefObject<boolean>;
};

/**
 * Changes to the photo itself rather than its coloring sheet: mirroring it,
 * and adding an AI portrait version of a landscape photo to its versions.
 */
export function useV2PhotoTransforms({ sheetCredits, lockRef }: PhotoTransformOptions) {
  const toast = useV2Toast();
  const { photosRef, updatePhoto, trackPreviewUrl } = useV2Studio();
  const [mirroringId, setMirroringId] = useState<string | null>(null);
  const [portraitId, setPortraitId] = useState<string | null>(null);

  function idle(photoId: string): V2PhotoEntry | null {
    const photo = photosRef.current.find((entry) => entry.id === photoId);
    if (!photo || lockRef.current || photo.generating || photo.correcting) return null;
    return photo;
  }

  /** Flip the photo left-to-right, and every version of it so they still match. */
  async function mirrorPhoto(photoId: string) {
    const photo = idle(photoId);
    if (!photo) return;

    lockRef.current = true;
    setMirroringId(photoId);
    try {
      if (photo.remote) {
        const res = await library.mirrorPhoto(photo.remote.photoId);
        if (res.error) throw new Error(res.error.message);
        const fresh = await entryFromLibraryPhoto(res.data!);
        // Commit before dropping the old files' object URLs, so nothing is left showing them.
        flushSync(() => updatePhoto(photoId, fresh, { persist: false }));
        void evictEntryImages([photo]);
        return;
      }

      const flipped = await mirrorImageDataUrl(photo.photoDataUrl, "jpeg");
      const photoDataUrl =
        estimateDataUrlRawBytes(flipped) <= maxRawBytesPerImageInRequest(2)
          ? flipped
          : await compressImageDataUrlForApi(flipped, 2);
      const previewUrl = URL.createObjectURL(dataUrlToBlob(photoDataUrl));
      trackPreviewUrl(previewUrl);

      const revisions = await Promise.all(
        normalizeV2SheetRevisions(photo).map(async (revision) => {
          // Sheets are line art and stay lossless; a portrait photo version stays a JPEG.
          const format = revision.kind === "photo" ? "jpeg" : "png";
          return {
            ...revision,
            sheet: {
              ...revision.sheet,
              imageDataUrl: await mirrorImageDataUrl(revision.sheet.imageDataUrl, format),
              mimeType: `image/${format}`,
            },
          };
        }),
      );
      const active =
        revisions.find((revision) => revision.id === photo.activeRevisionId) ??
        revisions[revisions.length - 1] ??
        null;

      updatePhoto(photoId, {
        photoDataUrl,
        previewUrl,
        ...(active
          ? { sheet: active.sheet, sheetRevisions: revisions, activeRevisionId: active.id }
          : {}),
        ...(photo.crop ? { crop: mirrorPhotoCrop(photo.crop) } : {}),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mirror that photo.");
    } finally {
      lockRef.current = false;
      setMirroringId(null);
    }
  }

  /** Add an AI portrait version of a landscape photo to its versions. The photo itself is kept. */
  async function makePortrait(photoId: string) {
    const photo = idle(photoId);
    if (!photo || photoOrientation(photo) !== "landscape") return;
    if (!sheetCredits.canAfford("portrait", photo)) return;

    lockRef.current = true;
    setPortraitId(photoId);
    try {
      const response = await authedFetch(
        "/api/photo-portrait",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            photo.remote
              ? { photoId: photo.remote.photoId }
              : { photoDataUrl: photo.photoDataUrl, image: photo.image },
          ),
        },
        { withAuth: Boolean(photo.remote) },
      );
      let payload: {
        photo?: LibraryPhoto;
        image?: GeneratedPhoto;
        error?: string;
        code?: string;
        creditsBalanceCents?: number;
      };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        throw new Error("The server sent an unexpected response. Please try again in a moment.");
      }
      if (sheetCredits.applyResponse(response.status, payload, "portrait")) return;
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not make a portrait version.");
      }

      if (payload.photo) {
        const fresh = await entryFromLibraryPhoto(payload.photo);
        updatePhoto(photoId, fresh, { persist: false });
      } else if (payload.image) {
        const version: SheetVersion = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          sheet: {
            title: PORTRAIT_VERSION_TITLE,
            imageDataUrl: payload.image.imageDataUrl,
            mimeType: payload.image.mimeType,
          },
          kind: "photo",
          orientation: "portrait",
        };
        const prior = photosRef.current.find((entry) => entry.id === photoId) ?? photo;
        updatePhoto(photoId, {
          sheet: version.sheet,
          sheetRevisions: [...normalizeV2SheetRevisions(prior), version],
          activeRevisionId: version.id,
        });
      } else {
        throw new Error("No portrait photo came back.");
      }
      toast.success({
        title: "Portrait version ready",
        message: "It's in this photo's versions. Generate a coloring sheet from it when you're ready.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not make a portrait version.");
    } finally {
      lockRef.current = false;
      setPortraitId(null);
    }
  }

  return { mirrorPhoto, makePortrait, mirroringId, portraitId };
}
