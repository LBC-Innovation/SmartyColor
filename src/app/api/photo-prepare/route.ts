import {
  compressImageBufferToBudget,
  decodePhotoToJpegExport,
} from "@/lib/ai/compressPhotoServer";
import { sniffHeicBytes } from "@/lib/ai/photoDataUrl";
import {
  formatPhotoSizeLimit,
  maxRawBytesPerImageInRequest,
  PHOTO_SERVER_UPLOAD_MAX_BYTES,
} from "@/lib/photo/payloadBudget";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File)) {
      return Response.json({ error: "Pick a photo first." }, { status: 400 });
    }

    if (photo.size > PHOTO_SERVER_UPLOAD_MAX_BYTES) {
      const limit = formatPhotoSizeLimit(PHOTO_SERVER_UPLOAD_MAX_BYTES);
      return Response.json(
        {
          error: `That file is too large for server conversion (max ${limit}). Convert it to JPG on your device, or use a smaller HEIC.`,
        },
        { status: 400 },
      );
    }

    const imageCountRaw = form.get("imageCount");
    const imageCount = imageCountRaw === "1" ? 1 : 2;

    let bytes = Buffer.from(await photo.arrayBuffer());
    const type = photo.type.toLowerCase();
    const isHeic =
      type === "image/heic" ||
      type === "image/heif" ||
      photo.name.toLowerCase().endsWith(".heic") ||
      photo.name.toLowerCase().endsWith(".heif") ||
      sniffHeicBytes(bytes);

    if (isHeic) {
      bytes = Buffer.from(await decodePhotoToJpegExport(bytes));
    } else if (!type.startsWith("image/") && !sniffHeicBytes(bytes)) {
      return Response.json(
        { error: "Please use a JPG, PNG, WebP, or HEIC photo." },
        { status: 400 },
      );
    } else if (type !== "image/jpeg") {
      bytes = Buffer.from(await decodePhotoToJpegExport(bytes));
    }

    const maxRaw = maxRawBytesPerImageInRequest(imageCount);
    if (bytes.length > maxRaw) {
      const compressed = await compressImageBufferToBudget(bytes, maxRaw);
      bytes = Buffer.from(compressed.bytes);
    }

    const photoDataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    return Response.json({ photoDataUrl });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not prepare that photo.";
    return Response.json({ error: message }, { status: 500 });
  }
}
