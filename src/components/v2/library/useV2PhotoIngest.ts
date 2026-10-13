"use client";

import { flushSync } from "react-dom";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import { uploadPhotoToLibrary } from "@/lib/v2/cloudLibrary";
import { isAllowedPhotoFile } from "@/lib/photo/heicFile";
import { inferPhotoLayout } from "@/lib/photo/orientation";
import {
  formatPhotoSizeLimit,
  PHOTO_UPLOAD_MAX_BYTES,
} from "@/lib/photo/payloadBudget";
import { preparePhotoFileForApi } from "@/lib/photo/preparePhotoUpload";
import { readBlobImageSize } from "@/lib/photo/readImageSize";
import { readPhotoCapturedAt } from "@/lib/photo/readPhotoCapturedAt";
import { defaultPrintPrefs, type PrintPrefs } from "@/lib/print/settings";
import { photoImageMeta, type V2PhotoEntry } from "@/lib/v2/studioTypes";

type IngestOptions = {
  /** Runs once per batch with every photo that made it into the library. */
  onAdded?: (entries: V2PhotoEntry[]) => void;
};

/**
 * Turns picked or dropped files into library photos: validates, prepares a
 * web-sized copy, uploads it (signed in) or keeps it local (guest), and shows
 * a placeholder row while each one is in flight. Shared by every studio page
 * so uploading behaves the same everywhere.
 */
export function useV2PhotoIngest(options?: IngestOptions) {
  const toast = useV2Toast();
  const {
    cloud,
    activeProjectId,
    setPendingUploads,
    appendPhoto,
    setSelectedId,
    trackPreviewUrl,
  } = useV2Studio();

  async function ingestFiles(fileList: FileList | File[]): Promise<V2PhotoEntry[]> {
    const files = Array.from(fileList);
    if (files.length === 0) return [];

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
      queue.push({ file, pendingId: crypto.randomUUID() });
    }
    if (queue.length === 0) return [];

    setPendingUploads((prev) => [
      ...prev,
      ...queue.map(({ pendingId }) => ({ id: pendingId })),
    ]);

    const added: V2PhotoEntry[] = [];

    for (const { file, pendingId } of queue) {
      try {
        const prepared = await preparePhotoFileForApi(file, 2);
        const size = await readBlobImageSize(prepared.previewBlob);
        const layout = inferPhotoLayout(size.width, size.height);
        const printPrefs: PrintPrefs = {
          ...defaultPrintPrefs,
          orientation: layout.orientation,
        };
        const capturedAt = await readPhotoCapturedAt(file);

        let entry: V2PhotoEntry;
        if (cloud) {
          if (!activeProjectId) throw new Error("No album selected.");
          entry = await uploadPhotoToLibrary({
            projectId: activeProjectId,
            blob: prepared.previewBlob,
            mimeType: prepared.previewBlob.type || "image/jpeg",
            layout,
            printPrefs,
            fileName: file.name,
            capturedAt,
          });
        } else {
          const previewUrl = URL.createObjectURL(prepared.previewBlob);
          trackPreviewUrl(previewUrl);
          entry = {
            id: crypto.randomUUID(),
            previewUrl,
            photoDataUrl: prepared.photoDataUrl,
            image: photoImageMeta(layout),
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
        }

        // Commit now, so photosRef (and anything reading it in onAdded) already holds this photo.
        flushSync(() => appendPhoto(entry));
        added.push(entry);
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : "Could not read this photo.";
        toast.error(`Could not add "${file.name}": ${detail}`);
      } finally {
        setPendingUploads((prev) => prev.filter((item) => item.id !== pendingId));
      }
    }

    if (added.length > 0) {
      const firstId = added[0].id;
      setSelectedId((current) => current ?? firstId);
      options?.onAdded?.(added);
    }
    return added;
  }

  return ingestFiles;
}
