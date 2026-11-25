import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Renders the Colorful Memories logo into every asset the app ships: the web
 * mark, PWA icons, favicon, social card, email logo and PNG fallbacks.
 * Run: node scripts/generate-brand-assets.mjs
 *
 * The mark's source of truth is design/brand/crayon-heart.svg, a crayon-textured
 * vector trace (~10 MB of paths). It is far too heavy to serve, and its texture
 * is raster detail anyway, so we ship it as trimmed WebP/PNG renders.
 * public/brand/wordmark.svg stays the wordmark's source. public/brand/mark.svg
 * and logo.svg are the older flat mark, still used where we need pure vector
 * (the printed cover credit via brandPaths.ts, and the share images).
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const BRAND_DIR = path.join(ROOT, "public/brand");
const PWA_DIR = path.join(ROOT, "public/pwa");
const APP_DIR = path.join(ROOT, "src/app");
const MASTER = path.join(ROOT, "design/brand/crayon-heart.svg");

const WHITE = "#ffffff";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Lockup geometry, in the units of src/components/v2/ui/V2BrandLogo.tsx (mark 400 tall). */
const LOCKUP_HEIGHT = 400;
/** Space between the mark and the wordmark, in lockup units. Mirrors V2BrandLogo.tsx. */
const LOCKUP_GAP = 24;

const masterSvg = await readFile(MASTER);
const wordmarkSvg = await readFile(path.join(BRAND_DIR, "wordmark.svg"));
const [, masterSize] = masterSvg.toString().match(/viewBox="0 0 (\d+) \d+"/).map(Number);

// Render the master once, large, and trim the empty canvas around the heart.
// Everything below is resized down from this so edges stay clean.
const MASTER_PX = 3000;
const markMaster = await sharp(masterSvg, { density: (72 * MASTER_PX) / masterSize, limitInputPixels: false })
  .resize(MASTER_PX)
  .trim({ threshold: 1 })
  .png()
  .toBuffer({ resolveWithObject: true });
const MARK_ASPECT = markMaster.info.width / markMaster.info.height;

/** The crayon mark fitted inside a box, as a PNG buffer. */
function mark(width, height = width) {
  return sharp(markMaster.data)
    .resize(Math.round(width), Math.round(height), { fit: "inside", kernel: "lanczos3" })
    .png()
    .toBuffer();
}

/** Rasterize an SVG to fit inside a box, well oversampled so edges stay clean. */
function fitSvg(svg, width, height = width) {
  return sharp(svg, { density: 600 })
    .resize(Math.round(width), Math.round(height), { fit: "inside" })
    .png()
    .toBuffer();
}

/**
 * Square icon with the mark centered.
 * @param {number} size
 * @param {object} o
 * @param {number} o.scale        Mark size as a fraction of the icon.
 * @param {string} [o.background] Fill colour; transparent when omitted.
 * @param {number} [o.radius]     Corner radius as a fraction of the icon (needs background).
 */
async function markIcon(size, { scale, background, radius = 0 }) {
  const art = await mark(size * scale);
  const base = background
    ? Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * radius}" fill="${background}"/></svg>`,
      )
    : { create: { width: size, height: size, channels: 4, background: TRANSPARENT } };
  return sharp(base)
    .composite([{ input: art, gravity: "centre" }])
    .png()
    .toBuffer();
}

/** Horizontal lockup (mark + wordmark) as a transparent PNG, `height` px tall. */
async function lockup(height) {
  const unit = height / LOCKUP_HEIGHT;
  const markWidth = Math.round(LOCKUP_HEIGHT * MARK_ASPECT * unit);
  const [, wmWidth, wmHeight] = wordmarkSvg.toString().match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
  const wordmark = await fitSvg(wordmarkSvg, wmWidth * unit, wmHeight * unit);
  const wordmarkMeta = await sharp(wordmark).metadata();
  const gap = Math.round(LOCKUP_GAP * unit);
  const width = markWidth + gap + wordmarkMeta.width;
  return sharp({ create: { width, height, channels: 4, background: TRANSPARENT } })
    .composite([
      { input: await mark(markWidth, height), left: 0, top: 0 },
      { input: wordmark, left: markWidth + gap, top: Math.round((height - wordmarkMeta.height) / 2) },
    ])
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

// Web mark: a small render for UI chrome (≤ ~80 CSS px at 3x) and a large one
// for splash screens and anywhere it is shown big. Heights follow the aspect.
const webp = (buffer) => sharp(buffer).webp({ quality: 84, alphaQuality: 100, effort: 6 }).toBuffer();
await Promise.all([
  mark(256, 256 / MARK_ASPECT).then(webp).then((b) => writeFile(path.join(BRAND_DIR, "mark-256.webp"), b)),
  mark(768, 768 / MARK_ASPECT).then(webp).then((b) => writeFile(path.join(BRAND_DIR, "mark.webp"), b)),
  mark(512, 512 / MARK_ASPECT).then((b) => writeFile(path.join(BRAND_DIR, "mark.png"), b)),
]);

// PWA: "any" icons sit on a white rounded tile; maskable ones are full-bleed
// with the mark inside the 80% safe zone. iOS rounds the touch icon itself.
const tile = { scale: 0.74, background: WHITE, radius: 0.22 };
const maskable = { scale: 0.6, background: WHITE };
await Promise.all([
  markIcon(192, tile).then((png) => writeFile(path.join(PWA_DIR, "icon-192.png"), png)),
  markIcon(512, tile).then((png) => writeFile(path.join(PWA_DIR, "icon-512.png"), png)),
  markIcon(192, maskable).then((png) => writeFile(path.join(PWA_DIR, "icon-192-maskable.png"), png)),
  markIcon(512, maskable).then((png) => writeFile(path.join(PWA_DIR, "icon-512-maskable.png"), png)),
  markIcon(180, { scale: 0.72, background: WHITE }).then((png) =>
    writeFile(path.join(PWA_DIR, "apple-touch-icon.png"), png),
  ),
  markIcon(32, { scale: 1 }).then((png) => writeFile(path.join(PWA_DIR, "icon-32.png"), png)),
]);
// The old scalable favicon was the flat mark; the crayon mark has no light SVG form.
await rm(path.join(PWA_DIR, "icon.svg"), { force: true });

// favicon.ico for browsers and crawlers that ignore <link rel="icon">.
const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(icoSizes.map((size) => markIcon(size, { scale: 1 })));
await writeFile(
  path.join(APP_DIR, "favicon.ico"),
  ico(icoSizes.map((size, i) => ({ size, png: icoPngs[i] }))),
);

// PNG fallbacks for places that can't take SVG or WebP (third-party listings).
await Promise.all([
  lockup(332).then((png) => writeFile(path.join(BRAND_DIR, "logo.png"), png)),
  fitSvg(wordmarkSvg, 1200, 1200).then((png) => writeFile(path.join(BRAND_DIR, "wordmark.png"), png)),
]);

// Email logo: inlined as a base64 attachment so it shows without loading anything.
const EMAIL_WIDTH = 240;
const emailPng = await sharp(await lockup(200)).resize({ width: EMAIL_WIDTH * 2 }).png({ compressionLevel: 9 }).toBuffer();
const emailMeta = await sharp(emailPng).metadata();
await writeFile(
  path.join(ROOT, "src/server/email/brandLogo.ts"),
  `import "server-only";

/**
 * The logo lockup at ${emailMeta.width}px wide (shown at ${EMAIL_WIDTH}px), for embedding in emails as an inline
 * attachment so it shows without the recipient loading anything from our server.
 * Generated by scripts/generate-brand-assets.mjs — do not edit by hand.
 */
export const EMAIL_LOGO_PNG_BASE64 =
  "${emailPng.toString("base64")}";

export const EMAIL_LOGO_WIDTH = ${EMAIL_WIDTH};
export const EMAIL_LOGO_HEIGHT = ${Math.round(emailMeta.height / 2)};
`,
);

// Social share card.
const cardLogo = await sharp(await lockup(240)).resize(860, 630, { fit: "inside" }).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: WHITE } })
  .composite([{ input: cardLogo, gravity: "centre" }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(APP_DIR, "opengraph-image.png"));

console.log(`Generated brand assets (mark aspect ${MARK_ASPECT.toFixed(4)}) in public/brand, public/pwa and src/app`);
