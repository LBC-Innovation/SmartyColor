// Turns one photo for the "What people are making" gallery into the webp files the landing pages load:
// public/marketing/made/<id>.webp (at most 1200px wide) plus <id>-400.webp and <id>-800.webp for srcset.
// Location and camera metadata are dropped (sharp writes none unless asked), so a customer's GPS
// position never ships with their photo. Prints the final width and height to copy into MADE_PHOTOS.
//
//   node scripts/prepare-made-images.mjs <photo.jpg|png|webp|heic> <id>
//
// Then add an entry with that id to MADE_PHOTOS in src/content/marketing.ts.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [input, id] = process.argv.slice(2);
if (!input || !id || !/^[a-z0-9-]+$/.test(id)) {
  console.log("Usage: node scripts/prepare-made-images.mjs <photo> <id>   (id: lowercase letters, digits and dashes)");
  process.exit(1);
}

const DIR = path.join(process.cwd(), "public/marketing/made");
const MAX_WIDTH = 1200;
const WIDTHS = [400, 800];

await mkdir(DIR, { recursive: true });
// rotate() applies the phone's EXIF orientation before the metadata is dropped.
const base = sharp(input).rotate().flatten({ background: "#ffffff" });
const full = await base.clone().resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(DIR, `${id}.webp`));
for (const w of WIDTHS) {
  await base.clone().resize({ width: w }).webp({ quality: 78 }).toFile(path.join(DIR, `${id}-${w}.webp`));
}
console.log(`${id}: width ${full.width}, height ${full.height}`);
