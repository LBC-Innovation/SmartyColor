import sharp from "sharp";

/** Long edge (px) the finished sheet is resampled to when the model returns less. */
const SHEET_LONG_EDGE = 2048;
/** Gray level where a stroke edge sits; keeps stroke width neutral. */
const NEUTRAL_MIDPOINT = 128;
/** Half-width of the soft edge ramp — gives anti-aliased, vector-like edges. */
const EDGE_HALF_WIDTH = 36;
/** Allowed drift from the reference stroke width before we correct it. */
const WIDTH_TOLERANCE = 0.08;
/**
 * Fresh sheets get strokes this much heavier (px per side at print size) so
 * lines feel deeper and richer. Edits instead match the sheet being edited,
 * which already carries this weight.
 */
const INK_BOOST_PX = 0.6;
/** Most a stroke edge is moved (px per side, at print size) to match weight. */
const MAX_EDGE_SHIFT = 3;

/**
 * Resample to print size with a high-quality kernel. The soft ramp between ink
 * and paper that this creates is what `renderSmoothInk` turns into clean,
 * anti-aliased curves instead of stair-stepped pixels.
 */
async function loadUpscaledGray(base64: string) {
  const input = Buffer.from(base64, "base64");
  const meta = await sharp(input).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  const scale = srcW && srcH ? Math.max(1, SHEET_LONG_EDGE / Math.max(srcW, srcH)) : 1;

  let pipeline = sharp(input).flatten({ background: "#ffffff" }).greyscale();
  if (scale > 1) {
    pipeline = pipeline.resize(
      Math.round(srcW * scale),
      Math.round(srcH * scale),
      { kernel: "lanczos3" },
    );
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { gray: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Typical stroke width as a fraction of page width: the trimmed mean of
 * horizontal + vertical ink run lengths. Long runs (borders, fills) and the
 * page margin are ignored. Only meaningful for comparing two sheets — not an
 * exact pixel width.
 */
function strokeWidthRatio(gray: Uint8Array, width: number, height: number): number {
  const inset = Math.ceil(Math.min(width, height) * 0.015);
  const maxRun = Math.max(4, Math.round(width * 0.02));
  const hist = new Uint32Array(maxRun + 1);
  let total = 0;

  const flush = (run: number) => {
    if (run > 0 && run <= maxRun) {
      hist[run]++;
      total++;
    }
  };

  for (let y = inset; y < height - inset; y++) {
    let run = 0;
    const row = y * width;
    for (let x = inset; x < width - inset; x++) {
      if (gray[row + x] < NEUTRAL_MIDPOINT) run++;
      else {
        flush(run);
        run = 0;
      }
    }
    flush(run);
  }
  for (let x = inset; x < width - inset; x++) {
    let run = 0;
    for (let y = inset; y < height - inset; y++) {
      if (gray[y * width + x] < NEUTRAL_MIDPOINT) run++;
      else {
        flush(run);
        run = 0;
      }
    }
    flush(run);
  }

  if (total < 200) return 0;
  // Drop the longest 10% of runs (junctions, merged strokes) before averaging.
  const keep = Math.floor(total * 0.9);
  let kept = 0;
  let sum = 0;
  for (let run = 1; run <= maxRun && kept < keep; run++) {
    const take = Math.min(hist[run], keep - kept);
    sum += take * run;
    kept += take;
  }
  return kept ? sum / kept / width : 0;
}

/**
 * One 3x3 grayscale max (thins dark ink) or min (thickens it) pass; `cross`
 * uses a plus-shaped kernel. Alternating the two keeps the result round.
 */
function morphPass(
  src: Uint8Array,
  width: number,
  height: number,
  thin: boolean,
  cross: boolean,
): Uint8Array {
  const dst = new Uint8Array(src.length);
  const pick = thin ? Math.max : Math.min;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(width - 1, x + 1);
      let v = src[y * width + x];
      v = pick(v, src[y * width + x0], src[y * width + x1]);
      v = pick(v, src[y0 * width + x], src[y1 * width + x]);
      if (!cross) {
        v = pick(
          v,
          src[y0 * width + x0],
          src[y0 * width + x1],
          src[y1 * width + x0],
          src[y1 * width + x1],
        );
      }
      dst[y * width + x] = v;
    }
  }
  return dst;
}

/**
 * Move every stroke edge by `px` pixels per side (positive thins, negative
 * thickens), with sub-pixel precision via blending the last pass.
 */
function shiftStrokeEdges(
  gray: Uint8Array,
  width: number,
  height: number,
  px: number,
): Uint8Array {
  const thin = px > 0;
  const amount = Math.abs(px);
  const whole = Math.floor(amount);
  const frac = amount - whole;
  let current = gray;
  for (let i = 0; i < whole; i++) {
    current = morphPass(current, width, height, thin, i % 2 === 1);
  }
  if (frac > 0.05) {
    const stepped = morphPass(current, width, height, thin, whole % 2 === 1);
    const blended = new Uint8Array(current.length);
    for (let i = 0; i < blended.length; i++) {
      blended[i] = Math.round(current[i] * (1 - frac) + stepped[i] * frac);
    }
    current = blended;
  }
  return current;
}

/**
 * Adjust the new sheet's gray image so its strokes match the reference's
 * weight. Models tend to return heavier lines on every edit; this undoes that.
 * Corrections are capped so fine details are never erased chasing a match.
 */
function matchStrokeWidth(
  gray: Uint8Array,
  width: number,
  height: number,
  referenceRatio: number,
): Uint8Array {
  if (!referenceRatio) return gray;
  let current = gray;
  let applied = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ratio = strokeWidthRatio(current, width, height);
    if (!ratio) break;
    if (Math.abs(ratio - referenceRatio) / referenceRatio <= WIDTH_TOLERANCE) break;
    // Runs on oblique strokes read ~1.27x wider than the stroke; each side
    // moves by half the width difference.
    const wanted = ((ratio - referenceRatio) * width) / 2 / 1.27;
    const next = Math.min(MAX_EDGE_SHIFT, Math.max(-MAX_EDGE_SHIFT, applied + wanted));
    if (Math.abs(next - applied) < 0.1) break;
    current = shiftStrokeEdges(gray, width, height, next);
    applied = next;
  }
  return current;
}

/** Map gray to ink with a smooth S-curve so edges keep their anti-aliasing. */
function renderSmoothInk(gray: Uint8Array, midpoint: number): Uint8Array {
  const lut = new Uint8Array(256);
  const lo = midpoint - EDGE_HALF_WIDTH;
  const span = EDGE_HALF_WIDTH * 2;
  for (let g = 0; g < 256; g++) {
    const t = Math.min(1, Math.max(0, (g - lo) / span));
    lut[g] = Math.round(255 * t * t * (3 - 2 * t));
  }
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = lut[gray[i]];
  return out;
}

/**
 * Sharpen the soft edges that enlarging a finished sheet leaves behind, without
 * making its strokes any thicker or thinner.
 */
export function crispInkEdges(gray: Uint8Array): Uint8Array {
  return renderSmoothInk(gray, NEUTRAL_MIDPOINT);
}

async function encodeGrayPng(data: Uint8Array, width: number, height: number) {
  const png = await sharp(Buffer.from(data), {
    raw: { width, height, channels: 1 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return png.toString("base64");
}

/**
 * Force a true coloring-book image: black ink on white paper, with smooth
 * anti-aliased edges. Colored / gray fills are wiped to white; only dark
 * near-neutral strokes remain.
 */
export async function toLineArtPng(base64: string): Promise<string> {
  const input = Buffer.from(base64, "base64");
  const { data, info } = await sharp(input)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const gray = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Colored pixels are fills, not ink: send them to paper white.
    gray[i] = chroma >= 48 ? 255 : Math.round(luminance);
  }

  const png = await sharp(gray, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  const upscaled = await loadUpscaledGray(png.toString("base64"));
  const bolder = shiftStrokeEdges(
    upscaled.gray,
    upscaled.width,
    upscaled.height,
    -INK_BOOST_PX,
  );
  const smooth = renderSmoothInk(bolder, 118);
  return encodeGrayPng(smooth, upscaled.width, upscaled.height);
}

type InkBlob = {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  perimeter: number;
};

/** Clear obvious fills without erasing connected line-art components. */
function removeMajorSolidInkFills(
  data: Uint8Array,
  width: number,
  height: number,
) {
  const labels = new Int32Array(width * height);
  const blobs: InkBlob[] = [];
  let nextLabel = 1;
  const idx = (x: number, y: number) => y * width + x;
  const isInk = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return data[idx(x, y)] < 128;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      if (!isInk(x, y) || labels[i] !== 0) continue;

      const label = nextLabel++;
      const blob: InkBlob = {
        area: 0,
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
        perimeter: 0,
      };
      blobs[label] = blob;
      const stack = [i];
      labels[i] = label;

      while (stack.length) {
        const cur = stack.pop()!;
        blob.area++;
        const cx = cur % width;
        const cy = Math.floor(cur / width);
        blob.minX = Math.min(blob.minX, cx);
        blob.minY = Math.min(blob.minY, cy);
        blob.maxX = Math.max(blob.maxX, cx);
        blob.maxY = Math.max(blob.maxY, cy);

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!isInk(nx, ny)) {
            blob.perimeter++;
            continue;
          }
          const ni = idx(nx, ny);
          if (labels[ni] !== 0) continue;
          labels[ni] = label;
          stack.push(ni);
        }
      }
    }
  }

  const imageArea = width * height;
  // Pixel constants below were tuned for a ~1K long edge.
  const k = Math.max(1, Math.max(width, height) / 1024);
  const minArea = Math.max(900 * k * k, Math.round(imageArea * 0.0035));
  const out = new Uint8Array(data);

  for (let label = 1; label < nextLabel; label++) {
    const blob = blobs[label];
    if (!blob || blob.area < minArea) continue;

    const bboxW = blob.maxX - blob.minX + 1;
    const bboxH = blob.maxY - blob.minY + 1;
    const minSide = Math.min(bboxW, bboxH);
    const maxSide = Math.max(bboxW, bboxH);
    const fillRatio = blob.area / (bboxW * bboxH);
    const roundness =
      blob.perimeter > 0
        ? (4 * Math.PI * blob.area) / (blob.perimeter * blob.perimeter)
        : 0;

    const isSolidFill =
      (blob.area > imageArea * 0.1 && fillRatio > 0.45) ||
      (minSide > 22 * k && fillRatio > 0.42) ||
      (blob.area > minArea * 2 && roundness > 0.18) ||
      (blob.area > minArea * 4 && fillRatio > 0.35);

    // Compact nearly-solid blobs (e.g. black spa mask) — never whole-page components.
    const isCompactSolidMask =
      blob.area >= 900 * k * k &&
      blob.area <= imageArea * 0.045 &&
      fillRatio > 0.76 &&
      minSide >= 14 * k &&
      maxSide <= 140 * k &&
      blob.area / imageArea < 0.05;

    if (!isSolidFill && !isCompactSolidMask) continue;

    for (let y = blob.minY; y <= blob.maxY; y++) {
      for (let x = blob.minX; x <= blob.maxX; x++) {
        const i = idx(x, y);
        if (labels[i] === label) out[i] = 255;
      }
    }
  }

  return out;
}

/** Thick rectangular frame flush with the outer edge of the sheet. */
function drawPhotoSheetBorder(
  data: Uint8Array,
  width: number,
  height: number,
) {
  const minSide = Math.min(width, height);
  const thickness = Math.max(6, Math.round(minSide * 0.007));

  const setInk = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    data[y * width + x] = 0;
  };

  for (let y = 0; y < thickness; y++) {
    for (let x = 0; x < width; x++) setInk(x, y);
  }
  for (let y = height - thickness; y < height; y++) {
    for (let x = 0; x < width; x++) setInk(x, y);
  }
  for (let x = 0; x < thickness; x++) {
    for (let y = thickness; y < height - thickness; y++) setInk(x, y);
  }
  for (let x = width - thickness; x < width; x++) {
    for (let y = thickness; y < height - thickness; y++) setInk(x, y);
  }
}

/** Grow a 0/1 mask outward by `radius` px (square kernel, separable). */
function dilateMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const dst = new Uint8Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!src[y * width + x]) continue;
        for (let d = -radius; d <= radius; d++) {
          const nx = horizontal ? x + d : x;
          const ny = horizontal ? y : y + d;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          dst[ny * width + nx] = 1;
        }
      }
    }
    return dst;
  };
  return pass(pass(mask, true), false);
}

/**
 * Photo sheets: upscale, clear gray noise and solid fills, then render every
 * stroke with smooth anti-aliased edges.
 *
 * Stroke width stays neutral (edges are placed at 50% gray — never a high
 * threshold, which fattens lines a little more on every edit). When a
 * `referenceBase64` sheet is given (the sheet being edited), the result is
 * adjusted so its strokes match that sheet's weight.
 */
export async function toPhotoLineArtPng(
  base64: string,
  options: { referenceBase64?: string } = {},
): Promise<string> {
  const { gray, width, height } = await loadUpscaledGray(base64);

  let working: Uint8Array = options.referenceBase64
    ? gray
    : shiftStrokeEdges(gray, width, height, -INK_BOOST_PX);
  if (options.referenceBase64) {
    try {
      const reference = await loadReferenceGray(options.referenceBase64);
      const referenceRatio = strokeWidthRatio(
        reference.gray,
        reference.width,
        reference.height,
      );
      working = matchStrokeWidth(gray, width, height, referenceRatio);
    } catch {
      /* unreadable reference: keep neutral width */
    }
  }

  const smooth = renderSmoothInk(working, NEUTRAL_MIDPOINT);

  // Fill detection works on a hard binary view; its result is applied to the
  // smooth image (with a small margin to catch the anti-aliased fringe).
  const binary = new Uint8Array(smooth.length);
  for (let i = 0; i < smooth.length; i++) binary[i] = smooth[i] < 128 ? 0 : 255;
  const cleared = removeMajorSolidInkFills(binary, width, height);
  const removed = new Uint8Array(smooth.length);
  let anyRemoved = false;
  for (let i = 0; i < removed.length; i++) {
    if (binary[i] === 0 && cleared[i] === 255) {
      removed[i] = 1;
      anyRemoved = true;
    }
  }
  if (anyRemoved) {
    const grown = dilateMask(removed, width, height, 2);
    for (let i = 0; i < grown.length; i++) if (grown[i]) smooth[i] = 255;
  }

  drawPhotoSheetBorder(smooth, width, height);
  return encodeGrayPng(smooth, width, height);
}

/** Reference sheet at its own resolution (width-normalized, no resampling). */
async function loadReferenceGray(base64: string) {
  const { data, info } = await sharp(Buffer.from(base64, "base64"))
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { gray: new Uint8Array(data), width: info.width, height: info.height };
}
