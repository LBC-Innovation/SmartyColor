/**
 * Best-effort capture timestamp: JPEG EXIF DateTimeOriginal, else file lastModified.
 */
export async function readPhotoCapturedAt(file: File): Promise<string> {
  const fromExif = await tryReadJpegDateTimeOriginal(file);
  if (fromExif) return fromExif;
  const ms = file.lastModified > 0 ? file.lastModified : Date.now();
  return new Date(ms).toISOString();
}

async function tryReadJpegDateTimeOriginal(file: File): Promise<string | null> {
  if (!file.type.includes("jpeg") && !file.type.includes("jpg")) {
    if (!/\.jpe?g$/i.test(file.name)) return null;
  }

  const head = file.slice(0, Math.min(file.size, 256 * 1024));
  const buffer = await head.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const tag = findExifDateTimeOriginal(bytes);
  if (!tag) return null;

  const parsed = parseExifDateTime(tag);
  return parsed;
}

function findExifDateTimeOriginal(bytes: Uint8Array): string | null {
  const needle = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  let exifStart = -1;
  for (let i = 0; i < bytes.length - needle.length; i++) {
    if (needle.every((b, j) => bytes[i + j] === b)) {
      exifStart = i + needle.length;
      break;
    }
  }
  if (exifStart < 0) return null;

  const chunk = bytesToAscii(bytes.subarray(exifStart, exifStart + 8192));
  const match = chunk.match(/(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

function bytesToAscii(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    out += c >= 32 && c < 127 ? String.fromCharCode(c) : " ";
  }
  return out;
}

function parseExifDateTime(raw: string): string | null {
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
