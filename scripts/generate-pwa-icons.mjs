import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "public/smarty.png");
const OUT_DIR = path.join(ROOT, "public/pwa");
const BACKGROUND = "#fff8ef";

async function icon(size, { maskable = false, filename }) {
  const logoScale = maskable ? 0.58 : 0.82;
  const logoSize = Math.round(size * logoScale);
  const logo = await sharp(SOURCE)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(OUT_DIR, filename));
}

await mkdir(OUT_DIR, { recursive: true });
await Promise.all([
  icon(180, { filename: "apple-touch-icon.png" }),
  icon(192, { filename: "icon-192.png" }),
  icon(512, { filename: "icon-512.png" }),
  icon(192, { maskable: true, filename: "icon-192-maskable.png" }),
  icon(512, { maskable: true, filename: "icon-512-maskable.png" }),
]);

console.log("Generated PWA icons in public/pwa/");
