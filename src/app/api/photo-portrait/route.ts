import {
  compressImageBufferToBudget,
  ensurePhotoDataUrlForRequest,
} from "@/lib/ai/compressPhotoServer";
import { createColoringAI } from "@/lib/ai/createProvider";
import { parsePhotoDataUrl } from "@/lib/ai/photoDataUrl";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { INSUFFICIENT_CREDITS_CODE } from "@/lib/credits/pricing";
import { maxRawBytesPerImageInRequest } from "@/lib/photo/payloadBudget";
import {
  PHOTO_NOT_LANDSCAPE_MESSAGE,
  PORTRAIT_VERSION_TITLE,
  type GeneratedPhoto,
  type PhotoImageSizeHint,
} from "@/lib/session/photoTypes";
import { withVisionUser } from "@/lib/visionCost/context";
import { bytesToDataUrl, photoDataUrlById } from "@/server/libraryImages";
import { addRevisionFromBytes } from "@/server/libraryService";
import {
  chargeSheetUsage,
  insufficientCreditsBody,
  quoteSheetUsage,
  refundSheetUsage,
} from "@/server/sheetUsageService";

export const maxDuration = 120;

/** Make a portrait version of a landscape photo, keeping its people and content. */
type Body =
  | { photoDataUrl: string; image?: PhotoImageSizeHint }
  /* Cloud library (signed-in): bytes are read from storage and the result is stored as a version of the photo. */
  | { photoId: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if ("photoId" in body) return await handleLibraryPhoto(request, body.photoId);

    if (!body.photoDataUrl?.trim()) {
      return Response.json({ error: "Pick a photo first." }, { status: 400 });
    }
    parsePhotoDataUrl(body.photoDataUrl);
    const photo = await ensurePhotoDataUrlForRequest(body.photoDataUrl, 1);
    const portrait = await createColoringAI().photoToPortrait({
      photoDataUrl: photo.dataUrl,
      image: body.image,
    });
    // Guests keep the photo in the browser and send it back to generate a sheet.
    const { bytes } = parsePhotoDataUrl(portrait.imageDataUrl);
    const sized = await compressImageBufferToBudget(bytes, maxRawBytesPerImageInRequest(2));
    const image: GeneratedPhoto = {
      ...portrait,
      imageDataUrl: bytesToDataUrl(sized.bytes, sized.mediaType),
      mimeType: sized.mediaType,
    };
    return Response.json({ image });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Could not reframe that photo.";
    if (raw === PHOTO_NOT_LANDSCAPE_MESSAGE) {
      return Response.json({ error: raw }, { status: 400 });
    }
    const message = /invalid json response/i.test(raw)
      ? "The image model had a temporary hiccup. Please try again."
      : raw;
    console.error("[photo-portrait]", raw, error);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleLibraryPhoto(request: Request, photoId: unknown) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const userId = auth.user.id;
  if (typeof photoId !== "string" || !photoId) {
    return Response.json({ error: "photoId is required." }, { status: 400 });
  }
  return withVisionUser(userId, async () => handleLibraryPhotoForUser(userId, photoId));
}

async function handleLibraryPhotoForUser(userId: string, photoId: string) {
  const source = await photoDataUrlById(userId, photoId);
  if (source.error) {
    return Response.json({ error: source.error.message }, { status: source.error.code === "NOT_FOUND" ? 404 : 500 });
  }
  const { photo: record, dataUrl } = source.data!;
  if (record.orientation && record.orientation !== "landscape") {
    return Response.json({ error: PHOTO_NOT_LANDSCAPE_MESSAGE }, { status: 400 });
  }

  // Don't spend on the model for a wallet that can't cover it.
  const quote = await quoteSheetUsage(userId, "portrait", 0);
  if (quote.error) return Response.json({ error: quote.error.message }, { status: 500 });
  if (!quote.data.affordable) {
    return Response.json(
      insufficientCreditsBody("portrait", quote.data.costCents, quote.data.creditsBalanceCents),
      { status: 402 },
    );
  }

  const portrait = await createColoringAI().photoToPortrait({
    photoDataUrl: dataUrl,
    image: record.width && record.height ? { width: record.width, height: record.height } : undefined,
  });

  // Charge only once there is a photo to hand over; refund if it can't be saved.
  const charge = await chargeSheetUsage(userId, record.id, "portrait");
  if (charge.error) {
    if (charge.error.code === INSUFFICIENT_CREDITS_CODE) {
      return Response.json(
        insufficientCreditsBody("portrait", quote.data.costCents, quote.data.creditsBalanceCents),
        { status: 402 },
      );
    }
    return Response.json({ error: charge.error.message }, { status: 500 });
  }

  let stored;
  try {
    stored = await addRevisionFromBytes(
      userId,
      { id: record.id, projectId: record.projectId },
      {
        bytes: parsePhotoDataUrl(portrait.imageDataUrl).bytes,
        mime: portrait.mimeType,
        title: PORTRAIT_VERSION_TITLE,
        kind: "photo",
        orientation: "portrait",
      },
    );
  } catch (error) {
    await refundSheetUsage(userId, record.id, "portrait", charge.data.chargedCents);
    throw error;
  }
  if (stored.error) {
    await refundSheetUsage(userId, record.id, "portrait", charge.data.chargedCents);
    return Response.json({ error: stored.error.message }, { status: 500 });
  }
  return Response.json({
    photo: stored.data,
    chargedCents: charge.data.chargedCents,
    creditsBalanceCents: charge.data.creditsBalanceCents,
  });
}
