import { compressImageDataUrlForApi } from "@/lib/photo/compressImageDataUrl";
import { isHeicFile } from "@/lib/photo/heicFile";

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

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

async function convertHeicInBrowser(file: File): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!(blob instanceof Blob)) {
    throw new Error("Could not convert that HEIC photo.");
  }
  return blob;
}

async function prepareViaServer(file: File, imageCount: 1 | 2): Promise<string> {
  const form = new FormData();
  form.append("photo", file, file.name || "photo.heic");
  form.append("imageCount", String(imageCount));

  const response = await fetch("/api/photo-prepare", {
    method: "POST",
    body: form,
  });
  const payload = (await response.json()) as { photoDataUrl?: string; error?: string };
  if (!response.ok || !payload.photoDataUrl) {
    throw new Error(payload.error ?? "Could not prepare that photo.");
  }
  return payload.photoDataUrl;
}

/**
 * Normalize phone uploads (incl. HEIC) to a JPEG data URL sized for our JSON API.
 */
export async function preparePhotoFileForApi(
  file: File,
  imageCount: 1 | 2,
): Promise<{ previewBlob: Blob; photoDataUrl: string }> {
  if (isHeicFile(file)) {
    try {
      const jpegBlob = await convertHeicInBrowser(file);
      const rawDataUrl = await readBlobAsDataUrl(jpegBlob);
      const photoDataUrl = await compressImageDataUrlForApi(rawDataUrl, imageCount);
      return { previewBlob: jpegBlob, photoDataUrl };
    } catch {
      const photoDataUrl = await prepareViaServer(file, imageCount);
      return { previewBlob: dataUrlToBlob(photoDataUrl), photoDataUrl };
    }
  }

  const rawDataUrl = await readBlobAsDataUrl(file);
  const photoDataUrl = await compressImageDataUrlForApi(rawDataUrl, imageCount);
  return { previewBlob: file, photoDataUrl };
}
