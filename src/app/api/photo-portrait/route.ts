import { friendlySafetyMessage } from "@/lib/security/publicError";
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
  alreadyOrientedMessage,
  PHOTO_NOT_LANDSCAPE_MESSAGE,
  PHOTO_NOT_PORTRAIT_MESSAGE,
  reframeVersionTitle,
  type GeneratedPhoto,
  type PhotoImageSizeHint,
  type ReframeTarget,
} from "@/lib/session/photoTypes";
import { checkGuestUsage, guestLimitResponse } from "@/server/guestUsageGuard";
import { withVisionUser } from "@/lib/visionCost/context";
import { startRequestTimer, type RequestTimer } from "@/server/requestTiming";
import { bytesToDataUrl, photoDataUrlById } from "@/server/libraryImages";
import { addRevisionFromBytes } from "@/server/libraryService";
import {
  chargeSheetUsage,
  insufficientCreditsBody,
  quoteSheetUsage,
  refundSheetUsage,
} from "@/server/sheetUsageService";
import { withVisionRequest } from "@/server/visionAttribution";

export const maxDuration = 120;

/**
 * Make a portrait version of a landscape photo (or, with target "landscape", a landscape version of
 * a portrait one), keeping its people and content.
 */
type Body = { target?: unknown } & (
  | { photoDataUrl: string; image?: PhotoImageSizeHint }
  /* Cloud library (signed-in): bytes are read from storage and the result is stored as a version of the photo. */
  | { photoId: string }
);

function readTarget(value: unknown): ReframeTarget | null {
  if (value === undefined) return "portrait";
  return value === "portrait" || value === "landscape" ? value : null;
}

/** AI costs from this request are recorded against the signed-in account, or the guest's address. */
export async function POST(request: Request) {
  return withVisionRequest(request, () => handlePost(request));
}

async function handlePost(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const target = readTarget(body.target);
    if (!target) return Response.json({ error: "target must be portrait or landscape." }, { status: 400 });
    if ("photoId" in body) return await handleLibraryPhoto(request, body.photoId, target);

    if (!body.photoDataUrl?.trim()) {
      return Response.json({ error: "Pick a photo first." }, { status: 400 });
    }
    parsePhotoDataUrl(body.photoDataUrl);
    // Guests are limited per day like pages (it is the same paid model); refunded only when the
    // failure comes before the model is called.
    const usage = await checkGuestUsage(request, "page");
    if (!usage.allowed) return guestLimitResponse(usage.scope, "page");
    let modelCalled = false;
    let portrait: GeneratedPhoto;
    try {
      const photo = await ensurePhotoDataUrlForRequest(body.photoDataUrl, 1);
      modelCalled = true;
      portrait = await createColoringAI().photoToPortrait({
        photoDataUrl: photo.dataUrl,
        image: body.image,
        target,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Refused before drawing (wrong shape, bad photo): nothing was spent.
      if (!modelCalled || message === PHOTO_NOT_LANDSCAPE_MESSAGE || message === PHOTO_NOT_PORTRAIT_MESSAGE) {
        await usage.refund();
      }
      throw error;
    }
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
    if (raw === PHOTO_NOT_LANDSCAPE_MESSAGE || raw === PHOTO_NOT_PORTRAIT_MESSAGE) {
      return Response.json({ error: raw }, { status: 400 });
    }
    const message = /invalid json response/i.test(raw)
      ? "The image model had a temporary hiccup. Please try again."
      : (friendlySafetyMessage(raw) ?? raw);
    console.error("[photo-portrait]", raw, error);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleLibraryPhoto(request: Request, photoId: unknown, target: ReframeTarget) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const userId = auth.user.id;
  if (typeof photoId !== "string" || !photoId) {
    return Response.json({ error: "photoId is required." }, { status: 400 });
  }
  const timer = startRequestTimer("photo-portrait");
  try {
    const response = await withVisionUser(userId, async () => handleLibraryPhotoForUser(userId, photoId, target, timer));
    timer.done({ status: response.status });
    return response;
  } catch (error) {
    timer.done({ status: "error" });
    throw error;
  }
}

async function handleLibraryPhotoForUser(userId: string, photoId: string, target: ReframeTarget, timer: RequestTimer) {
  const source = await photoDataUrlById(userId, photoId);
  timer.mark("loadPhoto");
  if (source.error) {
    return Response.json({ error: source.error.message }, { status: source.error.code === "NOT_FOUND" ? 404 : 500 });
  }
  const { photo: record, dataUrl } = source.data!;
  if (record.orientation && record.orientation === target) {
    return Response.json({ error: alreadyOrientedMessage(target) }, { status: 400 });
  }

  // Don't spend on the model for a wallet that can't cover it.
  const quote = await quoteSheetUsage(userId, "portrait", 0, record.id);
  timer.mark("quote");
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
    target,
  });

  timer.mark("model");

  // Charge only once there is a photo to hand over; refund if it can't be saved.
  const charge = await chargeSheetUsage(userId, record.id, "portrait");
  timer.mark("charge");
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
        title: reframeVersionTitle(target),
        kind: "photo",
        orientation: target,
      },
    );
    timer.mark("store");
  } catch (error) {
    await refundSheetUsage(userId, record.id, "portrait", charge.data.chargedCents, charge.data.purchaseCodeId);
    throw error;
  }
  if (stored.error) {
    await refundSheetUsage(userId, record.id, "portrait", charge.data.chargedCents, charge.data.purchaseCodeId);
    return Response.json({ error: stored.error.message }, { status: 500 });
  }
  return Response.json({
    photo: stored.data,
    chargedCents: charge.data.chargedCents,
    creditsBalanceCents: charge.data.creditsBalanceCents,
    coveredByCode: Boolean(charge.data.purchaseCodeId),
  });
}
