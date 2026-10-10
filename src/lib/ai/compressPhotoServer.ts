import sharp from "sharp";
import { parsePhotoDataUrl, sniffHeicBytes } from "@/lib/ai/photoDataUrl";
import {
  maxRawBytesPerImageInRequest,
  VERCEL_JSON_BODY_BUDGET_BYTES,
} from "@/lib/photo/payloadBudget";

export async function compressImageBufferToBudget(
  input: Buffer,
  maxRawBytes: number,
): Promise<{ bytes: Buffer; mediaType: string }> {
  let quality = 86;
  let width: number | undefined;
  try {
    const meta = await sharp(input).metadata();
    width = meta.width;
  } catch {
    width = 2048;
  }

  let bytes = input;

  for (let attempt = 0; attempt < 18; attempt++) {
    if (bytes.length <= maxRawBytes) {
      return { bytes, mediaType: "image/jpeg" };
    }

    if (width) {
      width = Math.max(480, Math.floor(width * 0.85));
    }
    bytes = await sharp(bytes)
      .resize(
        width
          ? { width, fit: "inside", withoutEnlargement: true }
          : undefined,
      )
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    if (quality > 52) {
      quality -= 6;
    }
  }

  if (bytes.length > maxRawBytes) {
    throw new Error(
      "That image is too large to process on the server. Try a smaller photo.",
    );
  }

  return { bytes, mediaType: "image/jpeg" };
}

function isHeicMedia(mediaType: string, bytes: Buffer) {
  return (
    mediaType === "image/heic" ||
    mediaType === "image/heif" ||
    sniffHeicBytes(bytes)
  );
}

export async function decodePhotoToJpegExport(bytes: Buffer): Promise<Buffer> {
  try {
    return await sharp(bytes).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  } catch {
    throw new Error(
      "Could not read that HEIC photo. Try again or export it as JPG from Photos.",
    );
  }
}

async function normalizePhotoBytesForModel(input: Buffer): Promise<Buffer> {
  try {
    const meta = await sharp(input).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    let pipeline = sharp(input).rotate();

    const minSide = Math.min(width, height);
    if (minSide > 0 && minSide < 512) {
      const scale = 512 / minSide;
      pipeline = pipeline.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        fit: "inside",
        withoutEnlargement: false,
      });
    }

    return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  } catch {
    throw new Error(
      "That photo could not be read. Try re-uploading it as JPG or PNG.",
    );
  }
}

export async function ensurePhotoDataUrlForRequest(
  dataUrl: string,
  imageCount: 1 | 2,
): Promise<{ dataUrl: string; mediaType: string; base64: string; bytes: Buffer }> {
  const parsed = parsePhotoDataUrl(dataUrl);
  let mediaType = parsed.mediaType;
  let base64 = parsed.base64;
  let bytes = parsed.bytes;

  if (isHeicMedia(mediaType, bytes)) {
    bytes = Buffer.from(await decodePhotoToJpegExport(bytes));
  }
  bytes = Buffer.from(await normalizePhotoBytesForModel(bytes));
  mediaType = "image/jpeg";
  base64 = bytes.toString("base64");
  dataUrl = `data:${mediaType};base64,${base64}`;

  const maxRaw = maxRawBytesPerImageInRequest(imageCount);
  if (bytes.length > maxRaw) {
    const compressed = await compressImageBufferToBudget(bytes, maxRaw);
    bytes = Buffer.from(compressed.bytes);
    mediaType = compressed.mediaType;
    base64 = bytes.toString("base64");
    dataUrl = `data:${mediaType};base64,${base64}`;
  }

  return { dataUrl, mediaType, base64, bytes };
}

export function assertTotalJsonBodyWithinBudget(estimatedBytes: number) {
  if (estimatedBytes > VERCEL_JSON_BODY_BUDGET_BYTES) {
    throw new Error(
      "That request is too large after compression. Try a smaller photo.",
    );
  }
}
