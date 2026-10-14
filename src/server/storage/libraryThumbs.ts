import "server-only";
import { after } from "next/server";
import sharp from "sharp";
import { getObjectBytes, libraryPaths, putObject } from "@/server/storage/libraryFiles";

/**
 * Tile-sized copies of library images, so list and grid tiles never download full-size
 * originals. They're made in the background the first time an image is listed without one,
 * which covers new uploads, generated sheets, mirrored photos and older photos alike.
 */

const THUMB_MAX_PX = 480;
/** Per response, so a large album fills in over a few loads rather than one long request. */
const MAX_PER_REQUEST = 12;
const CONCURRENCY = 3;

// Per server instance: skip work another request is already doing, or that already failed.
const inProgress = new Set<string>();
const failed = new Set<string>();

export async function makeThumbnail(bytes: Buffer | Uint8Array): Promise<Buffer> {
  return sharp(bytes, { failOn: "none" })
    // Bake in EXIF rotation; the output carries no metadata.
    .rotate()
    .resize({ width: THUMB_MAX_PX, height: THUMB_MAX_PX, fit: "inside", withoutEnlargement: true })
    // Sheets can be transparent PNGs; tiles expect them on white.
    .flatten({ background: "#ffffff" })
    .webp({ quality: 78 })
    .toBuffer();
}

async function writeThumbnail(imagePath: string): Promise<void> {
  try {
    const { bytes } = await getObjectBytes(imagePath);
    await putObject(libraryPaths.thumb(imagePath), await makeThumbnail(bytes), "image/webp");
  } catch (e) {
    failed.add(imagePath);
    console.error(
      JSON.stringify({ level: "warn", message: "library: thumbnail failed", path: imagePath, error: String(e) }),
    );
  } finally {
    inProgress.delete(imagePath);
  }
}

/** Make thumbnails for these images once the current response has been sent. */
export function scheduleThumbnails(imagePaths: string[]): void {
  const todo = [...new Set(imagePaths)]
    .filter((p) => !inProgress.has(p) && !failed.has(p))
    .slice(0, MAX_PER_REQUEST);
  if (todo.length === 0) return;
  for (const p of todo) inProgress.add(p);

  const run = async () => {
    const worker = async () => {
      for (let path = todo.shift(); path; path = todo.shift()) await writeThumbnail(path);
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  };
  try {
    after(run);
  } catch {
    // Not inside a request (scripts, tests): just run it.
    void run();
  }
}
