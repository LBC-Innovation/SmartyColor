/**
 * Turns a photo into a soft graphite pencil sketch on a canvas, in the browser.
 * Used by the loading state so the page looks like it is being drawn from the
 * user's own photo while the real coloring sheet is made on the server.
 *
 * Classic "color dodge" sketch: gray / (1 − blurred inverted gray), then a
 * gentle curve so lines read as pencil rather than ink. Runs on a small copy
 * (≤ maxEdge px), which takes a few milliseconds.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the photo for the sketch."));
    img.src = src;
  });
}

/** Separable box blur on a single-channel buffer (run twice ≈ gaussian). */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / span;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / span;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

export type PencilSketch = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

export async function makePencilSketch(src: string, maxEdge = 720): Promise<PencilSketch> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let pixels: ImageData;
  try {
    pixels = ctx.getImageData(0, 0, width, height);
  } catch {
    // A cross-origin photo without CORS can be drawn but not read: fall back to
    // a grayscale, high-contrast version, which still reads as a sketch.
    ctx.filter = "grayscale(1) contrast(1.5) brightness(1.2)";
    ctx.drawImage(img, 0, 0, width, height);
    ctx.filter = "none";
    return { canvas, width, height };
  }

  const data = pixels.data;
  const n = width * height;
  const gray = new Float32Array(n);
  const inverted = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    gray[i] = g;
    inverted[i] = 255 - g;
  }
  const radius = Math.max(2, Math.round(Math.max(width, height) / 140));
  const blurred = boxBlur(boxBlur(inverted, width, height, radius), width, height, radius);

  for (let i = 0; i < n; i++) {
    const dodge = Math.min(255, (gray[i] * 255) / Math.max(1, 255 - blurred[i]));
    // Darken the mid-lines a touch so the sketch holds up at small sizes.
    const t = dodge / 255;
    const v = 255 * Math.pow(t, 3.4);
    // Graphite: a faint cool tint on the darker strokes.
    data[i * 4] = v;
    data[i * 4 + 1] = v + (255 - v) * 0.02;
    data[i * 4 + 2] = Math.min(255, v + (255 - v) * 0.08);
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return { canvas, width, height };
}
