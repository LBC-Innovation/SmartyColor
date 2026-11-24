import "server-only";
import { after } from "next/server";
import sharp from "sharp";
import { getObjectBytes, libraryPaths, putObject } from "@/server/storage/libraryFiles";

/**
 * Resized copies of library images, so the app rarely downloads a full-size file:
 *   thumb    tile-sized, for lists and grids
 *   display  screen-sized, for viewing one image large
 * They're made in the background the first time an image is listed without them, which covers
 * new uploads, generated sheets, mirrored photos and older photos alike. Both come from one
 * download of the source.
 */

export type ImageCopyKind = "thumb" | "display";

const THUMB_MAX_PX = 480;
/** Sharp on a phone or a laptop panel; far below print size, which still uses the original. */
const DISPLAY_MAX_PX = 1600;
/** Per response, so a large album fills in over a few loads rather than one long request. */
const MAX_PER_REQUEST = 12;
const CONCURRENCY = 3;

// Per server instance: skip work another request is already doing, or that already failed.
// Keyed by kind and path, so a failed thumbnail doesn't stop the display copy and vice versa.
const inProgress = new Set<string>();
const failed = new Set<string>();
const keyFor = (kind: ImageCopyKind, path: string) => `${kind}:${path}`;

function resized(bytes: Buffer | Uint8Array, maxPx: number, quality: number): Promise<Buffer> {
  return sharp(bytes, { failOn: "none" })
    // Bake in EXIF rotation; the output carries no metadata.
    .rotate()
    .resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true })
    // Sheets can be transparent PNGs; tiles and viewers expect them on white.
    .flatten({ background: "#ffffff" })
    .webp({ quality })
    .toBuffer();
}

export function makeThumbnail(bytes: Buffer | Uint8Array): Promise<Buffer> {
  return resized(bytes, THUMB_MAX_PX, 78);
}

export function makeDisplayCopy(bytes: Buffer | Uint8Array): Promise<Buffer> {
  return resized(bytes, DISPLAY_MAX_PX, 82);
}

const MAKERS: Record<ImageCopyKind, { path: (p: string) => string; make: (b: Buffer) => Promise<Buffer> }> = {
  thumb: { path: libraryPaths.thumb, make: makeThumbnail },
  display: { path: libraryPaths.display, make: makeDisplayCopy },
};

async function writeCopies(imagePath: string, kinds: ImageCopyKind[]): Promise<void> {
  try {
    const { bytes } = await getObjectBytes(imagePath);
    for (const kind of kinds) {
      const maker = MAKERS[kind];
      try {
        await putObject(maker.path(imagePath), await maker.make(bytes), "image/webp");
      } catch (e) {
        failed.add(keyFor(kind, imagePath));
        console.error(
          JSON.stringify({ level: "warn", message: `library: ${kind} copy failed`, path: imagePath, error: String(e) }),
        );
      }
    }
  } catch (e) {
    for (const kind of kinds) failed.add(keyFor(kind, imagePath));
    console.error(
      JSON.stringify({ level: "warn", message: "library: image copy source failed", path: imagePath, error: String(e) }),
    );
  } finally {
    for (const kind of kinds) inProgress.delete(keyFor(kind, imagePath));
  }
}

/**
 * Make the missing copies once the current response has been sent. `missing` maps each source
 * image to the kinds it lacks.
 */
export function scheduleImageCopies(missing: Map<string, ImageCopyKind[]>): void {
  const todo: Array<{ path: string; kinds: ImageCopyKind[] }> = [];
  for (const [path, kinds] of missing) {
    const wanted = [...new Set(kinds)].filter(
      (k) => !inProgress.has(keyFor(k, path)) && !failed.has(keyFor(k, path)),
    );
    if (wanted.length === 0) continue;
    todo.push({ path, kinds: wanted });
    if (todo.length >= MAX_PER_REQUEST) break;
  }
  if (todo.length === 0) return;
  for (const item of todo) for (const k of item.kinds) inProgress.add(keyFor(k, item.path));

  const run = async () => {
    const worker = async () => {
      for (let item = todo.shift(); item; item = todo.shift()) await writeCopies(item.path, item.kinds);
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

/** Make thumbnails for these images once the current response has been sent. */
export function scheduleThumbnails(imagePaths: string[]): void {
  scheduleImageCopies(new Map(imagePaths.map((p) => [p, ["thumb"] as ImageCopyKind[]])));
}
