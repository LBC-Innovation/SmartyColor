// Turns the lifestyle PNGs in public/marketing/lifestyle into the webp files the landing pages load:
// <id>.webp (at most 1600px wide) plus <id>-400.webp and <id>-800.webp for srcset.
// Prints each image's final width and height to copy into LIFESTYLE_PHOTOS in src/content/marketing.ts.
//
//   node scripts/prepare-lifestyle-images.mjs
//
// Prompts for the images and the full steps are in docs/landing-redesign.md.
import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "public/marketing/lifestyle");
const MAX_WIDTH = 1600;
const WIDTHS = [400, 800];

const files = (await readdir(DIR).catch(() => [])).filter((f) => /\.(png|jpe?g)$/i.test(f));
if (files.length === 0) {
  console.log(`No .png or .jpg files in ${DIR}. Save the generated images there first.`);
  process.exit(0);
}

for (const file of files) {
  const id = file.replace(/\.(png|jpe?g)$/i, "");
  const src = path.join(DIR, file);
  // Flatten first: sharp keeps an alpha channel through resize, and webp with alpha is larger for no gain.
  const base = sharp(src).rotate().flatten({ background: "#ffffff" });
  const full = await base.clone().resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(DIR, `${id}.webp`));
  for (const w of WIDTHS) {
    await base.clone().resize({ width: w }).webp({ quality: 80 }).toFile(path.join(DIR, `${id}-${w}.webp`));
  }
  console.log(`${id}: width ${full.width}, height ${full.height}`);
}
console.log("\nSet ready: true and these sizes for each id in LIFESTYLE_PHOTOS (src/content/marketing.ts).");
