import type { PhotoCropRect } from "@/lib/v2/storybookTypes";

export async function applyPhotoCropDataUrl(
  photoDataUrl: string,
  crop: PhotoCropRect | null,
): Promise<string> {
  if (!crop) return photoDataUrl;
  if (crop.width <= 0 || crop.height <= 0) return photoDataUrl;

  const img = await loadImage(photoDataUrl);
  const sx = Math.round(crop.x * img.width);
  const sy = Math.round(crop.y * img.height);
  const sw = Math.round(crop.width * img.width);
  const sh = Math.round(crop.height * img.height);

  if (sw < 8 || sh < 8) return photoDataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return photoDataUrl;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const mime = photoDataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";
  return canvas.toDataURL(mime, 0.92);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for crop."));
    img.src = dataUrl;
  });
}
