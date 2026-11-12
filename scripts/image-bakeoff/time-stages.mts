// Times each stage of a photo → coloring sheet request, comparing the original
// photo against a downscaled copy sent to the image model.
//   SUPABASE_SERVICE_ROLE_KEY= node --env-file=.env.local --import ./scripts/image-bakeoff/alias-loader.mjs \
//     scripts/image-bakeoff/time-stages.mts <photo> [maxEdge=1536]
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createImageGenerator } from "@/lib/ai/image";
import { buildPhotoColoringPrompt } from "@/lib/ai/prompts";
import { inferPhotoLayout } from "@/lib/photo/orientation";
import { toPhotoLineArtPng } from "@/lib/print/lineArt";
import { defaultPrintPrefs } from "@/lib/print/settings";

const [photoPath, maxEdgeArg] = process.argv.slice(2);
const maxEdge = Number(maxEdgeArg ?? 1536);
const gen = createImageGenerator();

async function stage<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  console.log(`  ${label.padEnd(34)} ${String(Math.round(performance.now() - t0)).padStart(6)} ms`);
  return r;
}

async function run(label: string, prepare: (b: Buffer) => Promise<{ bytes: Buffer; mediaType: string }>) {
  console.log(`\n${label} (${gen.vendor} ${gen.modelId})`);
  const total0 = performance.now();
  const original = await stage("read file + base64 data URL", async () => {
    const b = await readFile(photoPath);
    return Buffer.from(`data:image/jpeg;base64,${b.toString("base64")}`.split(",")[1], "base64");
  });
  const photo = await stage("prepare photo (sharp)", () => prepare(original));
  const meta = await sharp(photo.bytes).metadata();
  const layout = inferPhotoLayout(meta.width!, meta.height!);
  console.log(`  sent to model: ${meta.width}x${meta.height}, ${(photo.bytes.length / 1e6).toFixed(2)} MB`);
  const image = await stage("image model call (incl. upload)", () =>
    gen.generate({
      operation: "photoToColoring",
      prompt: buildPhotoColoringPrompt(defaultPrintPrefs, layout),
      references: [{ base64: photo.bytes.toString("base64"), mediaType: photo.mediaType, caption: "REFERENCE PHOTOGRAPH" }],
      layout,
      purpose: "lineArt",
    }));
  const out = await sharp(Buffer.from(image.base64, "base64")).metadata();
  console.log(`  model returned: ${out.width}x${out.height}, ${(image.base64.length * 0.75 / 1e6).toFixed(2)} MB`);
  const sheet = await stage("line-art post-processing", () => toPhotoLineArtPng(image.base64));
  console.log(`  sheet PNG: ${(sheet.length * 0.75 / 1e6).toFixed(2)} MB`);
  console.log(`  ${"TOTAL".padEnd(34)} ${String(Math.round(performance.now() - total0)).padStart(6)} ms`);
}

// As the app does today: original bytes (rotated only when EXIF says so).
await run("ORIGINAL photo", async (b) => {
  const m = await sharp(b).metadata();
  if (!m.orientation || m.orientation === 1) return { bytes: b, mediaType: `image/${m.format === "jpeg" ? "jpeg" : m.format}` };
  return { bytes: await sharp(b).rotate().jpeg({ quality: 92 }).toBuffer(), mediaType: "image/jpeg" };
});

// Proposed: upright, capped at maxEdge, JPEG q85.
await run(`DOWNSCALED to ${maxEdge}px`, async (b) => ({
  bytes: await sharp(b).rotate().resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true }).toBuffer(),
  mediaType: "image/jpeg",
}));
