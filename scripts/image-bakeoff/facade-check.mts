// End-to-end check of the image facade through the app's real ColoringAI handlers.
// IMAGE_PROVIDER=openai node --env-file=.env.local --import ./scripts/image-bakeoff/alias-loader.mjs scripts/image-bakeoff/facade-check.mts <landscape-photo> <out-dir>
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createColoringAI } from "@/lib/ai/createProvider";
import { createImageGenerator } from "@/lib/ai/image";
import { defaultPrintPrefs } from "@/lib/print/settings";

const [photoPath, outDir] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const vendor = process.env.IMAGE_PROVIDER ?? "gemini";
const gen = createImageGenerator();
console.log(`vendor=${gen.vendor} model=${gen.modelId}`);

const bytes = await sharp(await readFile(photoPath)).rotate()
  .resize({ width: 2048, height: 2048, fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
const photoDataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
const ai = createColoringAI();

async function save(name: string, dataUrl: string) {
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  const m = await sharp(buf).metadata();
  await writeFile(path.join(outDir, `${vendor}-${name}.png`), buf);
  return `${m.width}x${m.height}`;
}

async function timed<T>(label: string, fn: () => Promise<T>) {
  const t0 = performance.now();
  try {
    const r = await fn();
    console.log(`ok   ${label} ${Math.round(performance.now() - t0)}ms`);
    return r;
  } catch (e) {
    console.log(`FAIL ${label} ${Math.round(performance.now() - t0)}ms — ${(e as Error).message}`);
    return null;
  }
}

const portrait = await timed("photoToPortrait", () => ai.photoToPortrait({ photoDataUrl }));
if (portrait) console.log("     portrait", await save("portrait", portrait.imageDataUrl));

const sheet = await timed("photoToColoring", () =>
  ai.photoToColoring({ photoDataUrl, printPrefs: { ...defaultPrintPrefs, orientation: "landscape" } }));
if (sheet) console.log("     coloring", await save("coloring", sheet.imageDataUrl));

if (sheet) {
  const fixed = await timed("correctPhotoColoring", () =>
    ai.correctPhotoColoring({
      photoDataUrl,
      sheetDataUrl: sheet.imageDataUrl,
      printPrefs: { ...defaultPrintPrefs, orientation: "landscape" },
      corrections: ["Remove any extra people or objects that are not in the photo."],
    }));
  if (fixed) console.log("     corrected", await save("corrected", fixed.imageDataUrl));
}

const generated = await timed("generate (text-to-image)", () =>
  ai.generate({
    session: {
      idea: "a friendly dragon reading a book under a tree",
      likes: [{ id: "1", text: "A friendly dragon sitting under a big oak tree reading a book" }, { id: "2", text: "Simple shapes, a few flowers in the grass" }],
      printPrefs: defaultPrintPrefs,
    },
  } as never));
if (generated) console.log("     generated", await save("generated", generated.imageDataUrl));
