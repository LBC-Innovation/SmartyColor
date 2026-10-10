import sharp from "sharp";

/**
 * Force a true coloring-book image: pure black ink on pure white paper.
 * Colored / gray fills are wiped to white; only dark near-neutral strokes remain.
 */
export async function toLineArtPng(base64: string): Promise<string> {
  const input = Buffer.from(base64, "base64");
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);
  const { width, height, channels } = info;

  for (let i = 0; i < width * height; i++) {
    const offset = i * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = channels > 3 ? data[offset + 3] : 255;

    if (a < 16) {
      out[offset] = 255;
      out[offset + 1] = 255;
      out[offset + 2] = 255;
      out[offset + 3] = 255;
      continue;
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const isInk = luminance < 110 && chroma < 48;

    const value = isInk ? 0 : 255;
    out[offset] = value;
    out[offset + 1] = value;
    out[offset + 2] = value;
    out[offset + 3] = 255;
  }

  const png = await sharp(out, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  return png.toString("base64");
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
  const minArea = Math.max(900, Math.round(imageArea * 0.0035));
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
      (minSide > 22 && fillRatio > 0.42) ||
      (blob.area > minArea * 2 && roundness > 0.18) ||
      (blob.area > minArea * 4 && fillRatio > 0.35);

    // Compact nearly-solid blobs (e.g. black spa mask) — never whole-page components.
    const isCompactSolidMask =
      blob.area >= 900 &&
      blob.area <= imageArea * 0.045 &&
      fillRatio > 0.76 &&
      minSide >= 14 &&
      maxSide <= 140 &&
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

/**
 * Photo sheets: trust the model line art; only clean gray noise and keep strokes thin.
 * (Heavy morph/threshold passes were adding jagged artifacts and stray lines.)
 */
export async function toPhotoLineArtPng(base64: string): Promise<string> {
  const input = Buffer.from(base64, "base64");

  const { data, info } = await sharp(input)
    .greyscale()
    .blur(0.45)
    .threshold(242)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const cleared = removeMajorSolidInkFills(
    new Uint8Array(data),
    width,
    height,
  );
  drawPhotoSheetBorder(cleared, width, height);

  const png = await sharp(Buffer.from(cleared), {
    raw: { width, height, channels: 1 },
  })
    .png()
    .toBuffer();

  return png.toString("base64");
}
