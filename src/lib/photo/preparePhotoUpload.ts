import { convertHeicFileToJpegBlob } from "@/lib/photo/convertHeic";
import { compressImageDataUrlForApi } from "@/lib/photo/compressImageDataUrl";
import { dataUrlToBlob } from "@/lib/photo/dataUrlBlob";
import { isHeicFile } from "@/lib/photo/heicFile";
import {
  formatPhotoSizeLimit,
  PHOTO_SERVER_UPLOAD_MAX_BYTES,
} from "@/lib/photo/payloadBudget";

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read that photo."));
    };
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.readAsDataURL(blob);
  });
}

async function prepareViaServer(file: File, imageCount: 1 | 2): Promise<string> {
  const form = new FormData();
  form.append("photo", file, file.name || "photo.heic");
  form.append("imageCount", String(imageCount));

  const response = await fetch("/api/photo-prepare", {
    method: "POST",
    body: form,
  });
  const payload = (await response.json()) as {
    photoDataUrl?: string;
    error?: string;
  };
  if (!response.ok || !payload.photoDataUrl) {
    throw new Error(payload.error ?? "Could not prepare that photo.");
  }
  return payload.photoDataUrl;
}

function heicServerFallbackError(file: File, cause?: string): Error {
  const limit = formatPhotoSizeLimit(PHOTO_SERVER_UPLOAD_MAX_BYTES);
  const base =
    file.size > PHOTO_SERVER_UPLOAD_MAX_BYTES
      ? `This HEIC is over ${limit}, so we cannot convert it on the server.`
      : "Browser conversion failed and server conversion did not succeed.";
  const hint =
    " Try opening the photo in Photos and using Share → Save to Files or Duplicate as JPG, then upload the JPG.";
  const detail = cause ? ` (${cause})` : "";
  return new Error(`${base}${detail}${hint}`);
}

/**
 * Normalize phone uploads (incl. HEIC) to a JPEG data URL sized for our JSON API.
 */
export async function preparePhotoFileForApi(
  file: File,
  imageCount: 1 | 2,
): Promise<{ previewBlob: Blob; photoDataUrl: string }> {
  if (isHeicFile(file)) {
    let browserError: string | undefined;
    try {
      const jpegBlob = await convertHeicFileToJpegBlob(file);
      const rawDataUrl = await readBlobAsDataUrl(jpegBlob);
      const photoDataUrl = await compressImageDataUrlForApi(
        rawDataUrl,
        imageCount,
      );
      return { previewBlob: jpegBlob, photoDataUrl };
    } catch (error) {
      browserError =
        error instanceof Error ? error.message : "Browser conversion failed.";
    }

    if (file.size <= PHOTO_SERVER_UPLOAD_MAX_BYTES) {
      try {
        const photoDataUrl = await prepareViaServer(file, imageCount);
        return { previewBlob: dataUrlToBlob(photoDataUrl), photoDataUrl };
      } catch (error) {
        const serverMsg =
          error instanceof Error ? error.message : "Server conversion failed.";
        throw heicServerFallbackError(file, serverMsg);
      }
    }

    throw heicServerFallbackError(file, browserError);
  }

  const rawDataUrl = await readBlobAsDataUrl(file);
  const photoDataUrl = await compressImageDataUrlForApi(rawDataUrl, imageCount);
  return { previewBlob: file, photoDataUrl };
}
