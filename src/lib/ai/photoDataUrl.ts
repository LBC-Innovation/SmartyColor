const ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/octet-stream",
]);

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

export type ParsedPhoto = {
  mediaType: string;
  base64: string;
  bytes: Buffer;
};

export function sniffHeicBytes(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (bytes.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = bytes.toString("ascii", 8, 12).toLowerCase();
  return HEIC_BRANDS.has(brand);
}

function resolveMediaType(declared: string, bytes: Buffer): string {
  const type = declared.toLowerCase();
  if (ALLOWED_MEDIA.has(type) && type !== "application/octet-stream") {
    return type;
  }
  if (sniffHeicBytes(bytes)) {
    return "image/heic";
  }
  if (type === "application/octet-stream" || type === "") {
    throw new Error("Please use a JPG, PNG, WebP, or HEIC photo.");
  }
  throw new Error("Please use a JPG, PNG, WebP, or HEIC photo.");
}

export function parsePhotoDataUrl(dataUrl: string): ParsedPhoto {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("That photo format did not look right. Try JPG or HEIC.");
  }
  const base64 = match[2];
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) {
    throw new Error("That photo file looks empty.");
  }
  const mediaType = resolveMediaType(match[1], bytes);
  return { mediaType, base64, bytes };
}

export function normalizeCorrections(raw: string[] | undefined): string[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw) {
    const text = line.trim().slice(0, 200);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 3) break;
  }
  return out;
}
