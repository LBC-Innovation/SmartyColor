/**
 * Quick fixes for a coloring page, done in the browser on a canvas: no model call, no cost.
 * Each returns a new PNG data URL; the caller stores it as a new version of the page.
 *
 * Rotation is 180° only. The book pipeline turns landscape art to portrait by itself
 * (`displayRotationForPrint` in `src/lib/print/bookPagePlan.ts`), so a 90° turn would either be
 * undone in the book or print sideways. A half turn keeps the page portrait and prints as shown.
 */

export type QuickFixKind = "flip" | "rotate" | "bolder" | "clean";

/** How many times "Bolder lines" may be applied on top of a drawing. */
export const BOLDER_MAX_LEVEL = 2;
const BOLDER_TAG = "bolder lines";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    // Cloud pages may still be signed storage URLs; CORS keeps the canvas readable.
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read that page."));
    el.src = src;
  });
}

function finish(canvas: HTMLCanvasElement): string {
  const url = canvas.toDataURL("image/png");
  // Safari holds canvas backing stores until they are resized away.
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

function drawn(img: HTMLImageElement, transform?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not change that page.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  transform?.(ctx, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return { canvas, ctx };
}

function luminance(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; p < out.length; i += 4, p += 1) {
    // Transparent pixels print as paper.
    const a = data[i + 3] / 255;
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    out[p] = Math.round(l * a + 255 * (1 - a));
  }
  return out;
}

function writeGray(data: Uint8ClampedArray, gray: Uint8ClampedArray) {
  for (let i = 0, p = 0; p < gray.length; i += 4, p += 1) {
    data[i] = gray[p];
    data[i + 1] = gray[p];
    data[i + 2] = gray[p];
    data[i + 3] = 255;
  }
}

/** Darkest value in each pixel's 3×3 neighbourhood: spreads ink by one pixel. */
function spreadInk(gray: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const rows = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      let m = gray[row + x];
      if (x > 0 && gray[row + x - 1] < m) m = gray[row + x - 1];
      if (x < w - 1 && gray[row + x + 1] < m) m = gray[row + x + 1];
      rows[row + x] = m;
    }
  }
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      let m = rows[p];
      if (y > 0 && rows[p - w] < m) m = rows[p - w];
      if (y < h - 1 && rows[p + w] < m) m = rows[p + w];
      // Only real lines spread; faint gray specks stay where they are.
      out[p] = m < 128 ? Math.min(gray[p], m) : gray[p];
    }
  }
  return out;
}

export async function applyQuickFix(src: string, kind: QuickFixKind): Promise<string> {
  const img = await loadImage(src);
  if (kind === "flip") {
    return finish(
      drawn(img, (ctx, w) => {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }).canvas,
    );
  }
  if (kind === "rotate") {
    return finish(
      drawn(img, (ctx, w, h) => {
        ctx.translate(w, h);
        ctx.rotate(Math.PI);
      }).canvas,
    );
  }
  const { canvas, ctx } = drawn(img);
  const w = canvas.width;
  const h = canvas.height;
  const pixels = ctx.getImageData(0, 0, w, h);
  let gray = luminance(pixels.data, w, h);
  if (kind === "bolder") {
    gray = spreadInk(gray, w, h);
  } else {
    // Pure black and white: faint gray specks become paper, soft lines become ink.
    for (let p = 0; p < gray.length; p += 1) gray[p] = gray[p] < 170 ? 0 : 255;
  }
  writeGray(pixels.data, gray);
  ctx.putImageData(pixels, 0, 0);
  return finish(canvas);
}

/** Title for the new version a quick fix makes. */
export function quickFixTitle(base: string, kind: QuickFixKind): string {
  const clean = base.trim() || "Coloring page";
  const label = kind === "flip" ? "flipped" : kind === "rotate" ? "turned" : kind === "bolder" ? BOLDER_TAG : "cleaned";
  return `${clean} · ${label}`;
}

/** How many times "Bolder lines" has already been applied to this version. */
export function bolderLevel(title: string | undefined): number {
  if (!title) return 0;
  return title.split(BOLDER_TAG).length - 1;
}
