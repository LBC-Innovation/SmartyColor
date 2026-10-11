import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Renders the ColorfulMemories brand mark (same geometry as V2BrandMark)
 * into the PWA icon set. Run: node scripts/generate-pwa-icons.mjs
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public/pwa");

/**
 * @param {object} o
 * @param {boolean} o.maskable  Full-bleed purple with the art kept inside the 80% safe zone.
 * @param {boolean} o.tilted    Snapshot tilt (off for maskable so the bleed stays square).
 */
function markSvg({ maskable }) {
  // Art is authored in a 40×40 box like the React component.
  const art = `
    <defs>
      <linearGradient id="tile" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#6d66f0"/><stop offset="1" stop-color="#3f3aa6"/>
      </linearGradient>
      <linearGradient id="stroke" x1="7" y1="30" x2="33" y2="10" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ff6b6b"/><stop offset="0.5" stop-color="#ffd166"/><stop offset="1" stop-color="#2ee6b7"/>
      </linearGradient>
    </defs>
    <path d="M8 29 C 14 32, 18 20, 24 20 S 31 13, 33 10" stroke="url(#stroke)" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 9 l1.6 3.4 L17 14 l-3.4 1.6 L12 19 l-1.6 -3.4 L7 14 l3.4 -1.6 Z" fill="#ffffff"/>`;

  if (maskable) {
    // Full-bleed tile; art scaled to ~70% so it survives every mask shape.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
      <rect width="40" height="40" fill="url(#tile)"/>
      <g transform="translate(20 20) scale(0.72) translate(-20 -20)">${art}</g>
      <defs>
        <linearGradient id="tile" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#6d66f0"/><stop offset="1" stop-color="#3f3aa6"/>
        </linearGradient>
      </defs>
    </svg>`;
  }
  // "any" icon: rounded tile on transparent, art full size.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
    ${art}
    <rect x="1.5" y="1.5" width="37" height="37" rx="9.5" fill="url(#tile)"/>
    <rect x="1.5" y="1.5" width="37" height="37" rx="9.5" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.5"/>
    <path d="M8 29 C 14 32, 18 20, 24 20 S 31 13, 33 10" stroke="url(#stroke)" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 9 l1.6 3.4 L17 14 l-3.4 1.6 L12 19 l-1.6 -3.4 L7 14 l3.4 -1.6 Z" fill="#ffffff"/>
  </svg>`;
}

async function render(size, { maskable, filename }) {
  const svg = Buffer.from(markSvg({ maskable }));
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(OUT_DIR, filename));
}

await mkdir(OUT_DIR, { recursive: true });
await Promise.all([
  render(180, { maskable: true, filename: "apple-touch-icon.png" }), // iOS rounds it; full-bleed looks right
  render(192, { maskable: false, filename: "icon-192.png" }),
  render(512, { maskable: false, filename: "icon-512.png" }),
  render(192, { maskable: true, filename: "icon-192-maskable.png" }),
  render(512, { maskable: true, filename: "icon-512-maskable.png" }),
  render(32, { maskable: false, filename: "favicon-32.png" }),
  render(16, { maskable: false, filename: "favicon-16.png" }),
]);
await writeFile(path.join(OUT_DIR, "icon.svg"), markSvg({ maskable: false }));

console.log("Generated PWA icons in public/pwa/");
