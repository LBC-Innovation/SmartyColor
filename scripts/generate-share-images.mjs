import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { LANDING_PAGES } from "../src/content/marketing.ts";

/**
 * Builds the 1200x630 share image for each landing page in src/content/marketing.ts: the page's
 * headline beside its hero photo and the coloring page made from it. Re-run after changing a
 * headline or hero pair: node scripts/generate-share-images.mjs
 *
 * Text uses Fredoka Bold when FREDOKA_FONT (or ~/.fonts/Fredoka-StaticBold.ttf) can be loaded,
 * and the system sans otherwise.
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const W = 1200;
const H = 630;
const INK = "#0a101a";
const PRIMARY = "#7446f0";
const BG = "#fbfbfc";

const FONT_SIZE = 62;
const LINE_HEIGHT = 70;
/** Approximate Fredoka Bold advance per character, as a fraction of the font size. */
const CHAR_EM = 0.53;
const TEXT_LEFT = 72;
const TEXT_WIDTH = 560;

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrap(text, maxChars) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const FONT_FILE = process.env.FREDOKA_FONT ?? path.join(os.homedir(), ".fonts/Fredoka-StaticBold.ttf");

/** One line of headline text as a transparent PNG, in ink or the brand gradient. */
async function textLine(text, { size, gradient, color = INK }) {
  const rendered = await sharp({
    text: {
      text: `<span foreground="${color}">${escapeXml(text)}</span>`,
      font: `Fredoka Bold ${size}`,
      fontfile: FONT_FILE,
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer();
  if (!gradient) return rendered;
  const { width, height } = await sharp(rendered).metadata();
  const fill = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fb513b"/><stop offset="0.5" stop-color="#fb267d"/><stop offset="1" stop-color="#794df9"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  return sharp(fill).composite([{ input: rendered, blend: "dest-in" }]).png().toBuffer();
}

/** Eyebrow, headline (plain then gradient) and logo, laid out on the left half. */
async function textLayers(page) {
  const maxChars = Math.floor(TEXT_WIDTH / (FONT_SIZE * CHAR_EM));
  const lines = [
    ...wrap(page.headline[0], maxChars).map((t) => ({ t, gradient: false })),
    ...wrap(page.headline[1], maxChars).map((t) => ({ t, gradient: true })),
  ];
  const eyebrow = await textLine(page.eyebrow.toUpperCase(), { size: 22, color: PRIMARY });
  const rendered = await Promise.all(lines.map((l) => textLine(l.t, { size: FONT_SIZE, gradient: l.gradient })));
  const blockHeight = 22 + 26 + lines.length * LINE_HEIGHT;
  let top = Math.round((H - 60) / 2 - blockHeight / 2);
  const layers = [{ input: eyebrow, left: TEXT_LEFT, top }];
  top += 22 + 26;
  for (const input of rendered) {
    layers.push({ input, left: TEXT_LEFT, top });
    top += LINE_HEIGHT;
  }
  const logo = await sharp(path.join(PUBLIC_DIR, "brand/logo.svg"), { density: 300 }).resize({ height: 44 }).png().toBuffer();
  layers.push({ input: logo, left: TEXT_LEFT, top: H - 44 - 48 });
  return layers;
}

/** A tilted white-bordered print of an image. */
async function polaroid(src, width, angle) {
  const border = 12;
  const inner = await sharp(path.join(PUBLIC_DIR, src))
    .resize(width - border * 2, Math.round((width - border * 2) * 0.75), { fit: "cover" })
    .toBuffer();
  const height = Math.round((width - border * 2) * 0.75) + border * 2;
  const edge = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="#d9dce3"/></svg>`,
  );
  const framed = await sharp({ create: { width, height, channels: 4, background: "#ffffff" } })
    .composite([{ input: inner, left: border, top: border }, { input: edge }])
    .png()
    .toBuffer();
  return sharp(framed).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function build(page) {
  const photo = await polaroid(page.hero.photoSrc, 430, -5);
  const sheet = await polaroid(page.hero.sheetSrc, 430, 4);
  const out = path.join(PUBLIC_DIR, page.shareImage);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite([
      { input: photo, left: 630, top: 56 },
      { input: sheet, left: 720, top: 248 },
      ...(await textLayers(page)),
    ])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`wrote ${path.relative(ROOT, out)}`);
}

await readFile(FONT_FILE).catch(() => console.warn(`No Fredoka at ${FONT_FILE}; using the system sans.`));
for (const page of Object.values(LANDING_PAGES)) {
  await build(page);
}
