import { PDFDocument } from "pdf-lib";
import { zipSync } from "fflate";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";

export function slugify(name: string, fallback: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

/** Runs `work` over `items` with a few in flight; stops starting new ones once `cancelled()`. */
export async function runPool<T>(
  items: T[],
  limit: number,
  cancelled: () => boolean,
  work: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !cancelled()) {
      const i = next++;
      await work(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Joins single-page print PDFs (in the order given) into one document. */
export async function mergePdfs(parts: Blob[]): Promise<Blob> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(await part.arrayBuffer());
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

function extensionFor(blob: Blob, fileName?: string): string {
  const fromName = fileName?.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const t = blob.type.toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("heic")) return "heic";
  return "jpg";
}

/** The full-size original: cloud photos hold a cached object URL or signed URL, guests a blob or data URL. */
export async function fetchOriginal(photo: V2PhotoEntry): Promise<Blob> {
  const sources = [photo.previewUrl, photo.photoDataUrl].filter(Boolean);
  let lastError: unknown = null;
  for (const src of sources) {
    try {
      const res = await fetch(src);
      if (res.ok) return await res.blob();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not read the photo.");
}

/** A file name for an original, unique among `used`. */
export function originalFileName(photo: V2PhotoEntry, blob: Blob, index: number, used: Set<string>): string {
  const ext = extensionFor(blob, photo.fileName);
  const base = (photo.fileName?.replace(/\.[a-z0-9]{2,5}$/i, "") || `photo-${index + 1}`).replace(/[\\/:*?"<>|]+/g, "-");
  let name = `${base}.${ext}`;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}.${ext}`;
  used.add(name);
  return name;
}

/** Images are already compressed, so the zip just stores them. */
export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.name] = new Uint8Array(await f.blob.arrayBuffer());
  const zipped = zipSync(entries, { level: 0 });
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
