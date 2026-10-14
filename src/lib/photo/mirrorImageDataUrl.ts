/** Flip an image left-to-right in the browser. `src` may be a data URL or an object URL. */
export async function mirrorImageDataUrl(
  src: string,
  format: "jpeg" | "png",
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    // Cloud images may still be signed storage URLs; CORS keeps the canvas readable.
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read that image."));
    el.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not mirror that image.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);

  const dataUrl =
    format === "png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.95);
  // Safari holds canvas backing stores until they are resized away.
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}
