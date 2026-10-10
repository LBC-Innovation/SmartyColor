function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for overlay"));
    img.src = src;
  });
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxWidth: number,
  boxHeight: number,
  alpha: number,
) {
  const scale = Math.min(
    boxWidth / img.naturalWidth,
    boxHeight / img.naturalHeight,
  );
  const drawWidth = img.naturalWidth * scale;
  const drawHeight = img.naturalHeight * scale;
  const x = (boxWidth - drawWidth) / 2;
  const y = (boxHeight - drawHeight) / 2;
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x, y, drawWidth, drawHeight);
  ctx.globalAlpha = previousAlpha;
}

/** Rasterize original + sheet (object-contain, same as overlay preview) at full resolution. */
export async function compositeSheetOverlayDataUrl(
  originalSrc: string,
  sheetSrc: string,
  sheetOpacityPercent: number,
): Promise<string> {
  const [original, sheet] = await Promise.all([
    loadImage(originalSrc),
    loadImage(sheetSrc),
  ]);

  const width = original.naturalWidth;
  const height = original.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas for overlay");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  drawImageContain(ctx, original, width, height, 1);
  drawImageContain(
    ctx,
    sheet,
    width,
    height,
    Math.min(100, Math.max(0, sheetOpacityPercent)) / 100,
  );

  return canvas.toDataURL("image/png");
}
