/**
 * Shrink an image (object URL or data URL) so its long edge is at most
 * `maxDimension` px, returning a data URL. Used before embedding photos in
 * a PDF so a 30-page story book stays a few megabytes instead of fifty.
 */
export async function downscaleImageToDataUrl(
  src: string,
  maxDimension: number,
  options?: { format?: "jpeg" | "png"; quality?: number },
): Promise<string> {
  const format = options?.format ?? "jpeg";
  const img = await loadImage(src);
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = Math.min(1, maxDimension / Math.max(1, longEdge));

  // Already small and already a data URL: nothing to redraw.
  if (scale === 1 && src.startsWith("data:") && src.startsWith(`data:image/${format}`)) {
    return src;
  }

  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the image.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return format === "png"
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", options?.quality ?? 0.86);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Cloud images may still be signed storage URLs; CORS keeps the canvas readable.
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image."));
    img.src = src;
  });
}
