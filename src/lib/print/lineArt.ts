import "server-only";

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

    // Keep only dark, nearly neutral pixels as ink. Anything tinted or mid/light → white.
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
