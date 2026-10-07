import { maxRawBytesPerImageInRequest } from "@/lib/photo/payloadBudget";

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that photo."));
    img.src = dataUrl;
  });
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not compress that photo."));
      },
      "image/jpeg",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read compressed photo."));
    };
    reader.onerror = () => reject(new Error("Could not read compressed photo."));
    reader.readAsDataURL(blob);
  });
}

function drawScaled(
  img: HTMLImageElement,
  maxDimension: number,
): HTMLCanvasElement {
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the photo.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/**
 * Shrink a photo (or sheet preview) so its decoded size fits API limits.
 * Used in the browser before POSTing JSON to Vercel.
 */
export async function compressImageDataUrlForApi(
  dataUrl: string,
  imageCount: 1 | 2,
): Promise<string> {
  const maxRawBytes = maxRawBytesPerImageInRequest(imageCount);
  const img = await loadImage(dataUrl);

  let maxDimension = Math.max(img.width, img.height, 2048);
  let quality = 0.9;

  for (let attempt = 0; attempt < 16; attempt++) {
    const canvas = drawScaled(img, maxDimension);
    const blob = await canvasToJpegBlob(canvas, quality);
    if (blob.size <= maxRawBytes) {
      return blobToDataUrl(blob);
    }
    if (quality > 0.5) {
      quality -= 0.08;
    } else {
      maxDimension = Math.floor(maxDimension * 0.82);
      quality = 0.82;
    }
    if (maxDimension < 480) {
      throw new Error(
        "That photo is too large to send even after shrinking. Try a smaller picture.",
      );
    }
  }

  throw new Error("Could not shrink that photo enough. Try a smaller file.");
}
