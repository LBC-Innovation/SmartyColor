import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Renders the Colorful Memories logo (public/brand/*.svg is the source of truth)
 * into every raster the app ships: PWA icons, favicon, social card and PNG
 * fallbacks. Run: node scripts/generate-brand-assets.mjs
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const BRAND_DIR = path.join(ROOT, "public/brand");
const PWA_DIR = path.join(ROOT, "public/pwa");
const APP_DIR = path.join(ROOT, "src/app");

const WHITE = "#ffffff";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const markSvg = await readFile(path.join(BRAND_DIR, "mark.svg"));
const wordmarkSvg = await readFile(path.join(BRAND_DIR, "wordmark.svg"));
const logoSvg = await readFile(path.join(BRAND_DIR, "logo.svg"));

/** Rasterize an SVG to fit inside a box, well oversampled so edges stay clean. */
function fit(svg, width, height = width) {
  return sharp(svg, { density: 600 })
    .resize(Math.round(width), Math.round(height), { fit: "inside" })
    .png()
    .toBuffer();
}

/**
 * Square icon with the mark centered.
 * @param {number} size
 * @param {object} o
 * @param {number} o.scale        Mark width as a fraction of the icon.
 * @param {string} [o.background] Fill colour; transparent when omitted.
 * @param {number} [o.radius]     Corner radius as a fraction of the icon (needs background).
 */
async function markIcon(size, { scale, background, radius = 0 }) {
  const mark = await fit(markSvg, size * scale);
  const base = background
    ? Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * radius}" fill="${background}"/></svg>`,
      )
    : { create: { width: size, height: size, channels: 4, background: TRANSPARENT } };
  return sharp(base)
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toBuffer();
}

/** Pack PNGs into a .ico (PNG-compressed entries, supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size, at);
    header.writeUInt8(size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

await mkdir(PWA_DIR, { recursive: true });

// PWA: "any" icons sit on a white rounded tile; maskable ones are full-bleed
// with the mark inside the 80% safe zone. iOS rounds the touch icon itself.
const tile = { scale: 0.74, background: WHITE, radius: 0.22 };
const maskable = { scale: 0.58, background: WHITE };
await Promise.all([
  markIcon(192, tile).then((png) => writeFile(path.join(PWA_DIR, "icon-192.png"), png)),
  markIcon(512, tile).then((png) => writeFile(path.join(PWA_DIR, "icon-512.png"), png)),
  markIcon(192, maskable).then((png) => writeFile(path.join(PWA_DIR, "icon-192-maskable.png"), png)),
  markIcon(512, maskable).then((png) => writeFile(path.join(PWA_DIR, "icon-512-maskable.png"), png)),
  markIcon(180, { scale: 0.7, background: WHITE }).then((png) =>
    writeFile(path.join(PWA_DIR, "apple-touch-icon.png"), png),
  ),
]);

// Scalable favicon: the mark centered in a square, transparent.
const [, markWidth, markHeight] = markSvg.toString().match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
const markBody = markSvg.toString().match(/<path[\s\S]*<\/path>|<path[\s\S]*\/>/)[0];
await writeFile(
  path.join(PWA_DIR, "icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${markWidth} ${markWidth}" fill-rule="evenodd">\n<g transform="translate(0 ${(markWidth - markHeight) / 2})">\n${markBody}\n</g>\n</svg>\n`,
);

// favicon.ico for browsers and crawlers that ignore the SVG.
const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(icoSizes.map((size) => markIcon(size, { scale: 1 })));
await writeFile(
  path.join(APP_DIR, "favicon.ico"),
  ico(icoSizes.map((size, i) => ({ size, png: icoPngs[i] }))),
);

// PNG fallbacks for places that can't take SVG (email, third-party listings).
await Promise.all([
  fit(logoSvg, 1600, 1600).then((png) => writeFile(path.join(BRAND_DIR, "logo.png"), png)),
  fit(wordmarkSvg, 1200, 1200).then((png) => writeFile(path.join(BRAND_DIR, "wordmark.png"), png)),
  markIcon(512, { scale: 1 }).then((png) => writeFile(path.join(BRAND_DIR, "mark.png"), png)),
]);

// Social share card.
const cardLogo = await fit(logoSvg, 860, 630);
await sharp({ create: { width: 1200, height: 630, channels: 3, background: WHITE } })
  .composite([{ input: cardLogo, gravity: "centre" }])
  .png({ compressionLevel: 9, palette: true })
  .toFile(path.join(APP_DIR, "opengraph-image.png"));

console.log("Generated brand assets in public/brand, public/pwa and src/app");
