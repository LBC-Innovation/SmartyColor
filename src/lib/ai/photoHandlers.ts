import sharp from "sharp";
import {
  buildPhotoColoringPrompt,
  buildPhotoCorrectionPrompt,
  buildPhotoPortraitPrompt,
} from "@/lib/ai/prompts";
import { parsePhotoDataUrl } from "@/lib/ai/photoDataUrl";
import {
  displayedSize,
  inferPhotoLayout,
  layoutRatio,
  photoLayoutRetryNote,
  sheetOrientationMismatch,
  type PhotoLayout,
} from "@/lib/photo/orientation";
import type { ParsedPhoto } from "@/lib/ai/photoDataUrl";
import { createImageGenerator, type ImageReference } from "@/lib/ai/image";
import type { ColoringAI } from "@/lib/ai/types";
import { toPhotoLineArtPng } from "@/lib/print/lineArt";
import { defaultPrintPrefs, type PrintPrefs } from "@/lib/print/settings";
import {
  alreadyOrientedMessage,
  type GeneratedPhoto,
  type PhotoColoringCorrectRequest,
  type PhotoColoringGenerateRequest,
  type PhotoImageSizeHint,
  type PhotoPortraitRequest,
} from "@/lib/session/photoTypes";
import type { GeneratedSheet } from "@/lib/session/types";
import type { VisionCostOperation } from "@/lib/visionCost/types";

async function layoutForPhotoBytes(
  bytes: Buffer,
  printPrefs: PrintPrefs,
  hint?: PhotoImageSizeHint,
) {
  try {
    const meta = await sharp(bytes).metadata();
    if (meta.width && meta.height) {
      // Measure the photo as a person sees it (EXIF rotation applied).
      const size = displayedSize(meta.width, meta.height, meta.orientation);
      return inferPhotoLayout(size.width, size.height);
    }
  } catch {
    /* fall through */
  }
  // The client measured the original at upload; trust that before guessing.
  if (hint) return inferPhotoLayout(hint.width, hint.height);
  return inferPhotoLayout(
    printPrefs.orientation === "landscape" ? 1600 : 1200,
    printPrefs.orientation === "landscape" ? 900 : 1600,
  );
}

/**
 * Longest edge (px) of an image sent to the model. The models shrink inputs to
 * about this size anyway, so sending a full-resolution camera photo only adds
 * upload and processing time (5–13 s per request in testing). Override with
 * IMAGE_INPUT_MAX_EDGE.
 */
function modelInputMaxEdge(): number {
  const raw = Number.parseInt(process.env.IMAGE_INPUT_MAX_EDGE ?? "", 10);
  return Number.isFinite(raw) && raw >= 512 ? raw : 1536;
}

/**
 * The photo as the model should see it: upright (EXIF rotation baked in, so it
 * matches the layout measured from it) and no larger than the model needs.
 * Anything sharp cannot decode passes through unchanged.
 */
async function photoForModel(photo: ParsedPhoto): Promise<ParsedPhoto> {
  try {
    const meta = await sharp(photo.bytes).metadata();
    const maxEdge = modelInputMaxEdge();
    const rotated = Boolean(meta.orientation && meta.orientation !== 1);
    const oversized = Math.max(meta.width ?? 0, meta.height ?? 0) > maxEdge;
    if (!rotated && !oversized) return photo;
    const bytes = await sharp(photo.bytes)
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return { bytes, base64: bytes.toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return photo;
  }
}

/** A previous coloring sheet as the model should see it: kept as PNG (crisp lines), capped in size. */
async function sheetForModel(sheet: ParsedPhoto): Promise<ParsedPhoto> {
  try {
    const meta = await sharp(sheet.bytes).metadata();
    const maxEdge = modelInputMaxEdge();
    if (Math.max(meta.width ?? 0, meta.height ?? 0) <= maxEdge) return sheet;
    const bytes = await sharp(sheet.bytes)
      .resize({ width: maxEdge, height: maxEdge, fit: "inside" })
      .png({ compressionLevel: 6 })
      .toBuffer();
    return { bytes, base64: bytes.toString("base64"), mediaType: "image/png" };
  } catch {
    return sheet;
  }
}

/**
 * Last resort when the model keeps drawing the wrong way round: seat the whole
 * drawing on a white canvas of the photo's shape rather than hand back a sheet
 * that would print sideways.
 */
async function fitToLayout(
  file: { base64: string; mediaType: string },
  layout: PhotoLayout,
): Promise<{ base64: string; mediaType: string }> {
  const ratio = layoutRatio(layout);
  const meta = await sharp(Buffer.from(file.base64, "base64")).metadata();
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0, 1024);
  const width = Math.round(ratio >= 1 ? longEdge : longEdge * ratio);
  const height = Math.round(ratio >= 1 ? longEdge / ratio : longEdge);
  const bytes = await sharp(Buffer.from(file.base64, "base64"))
    .resize(width, height, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  return { base64: bytes.toString("base64"), mediaType: "image/png" };
}

async function toSheet(
  file: { base64: string; mediaType: string },
  showTitle: boolean,
  referenceBase64?: string,
): Promise<GeneratedSheet> {
  const lineArtBase64 = await toPhotoLineArtPng(file.base64, { referenceBase64 });
  return {
    title: showTitle ? "My photo coloring page" : "Coloring page",
    imageDataUrl: `data:image/png;base64,${lineArtBase64}`,
    mimeType: "image/png",
  };
}

async function isWrongWayRound(
  file: { base64: string },
  layout: PhotoLayout,
): Promise<boolean> {
  try {
    const meta = await sharp(Buffer.from(file.base64, "base64")).metadata();
    if (!meta.width || !meta.height) return false;
    const size = displayedSize(meta.width, meta.height, meta.orientation);
    return sheetOrientationMismatch(layout, size.width, size.height);
  } catch {
    return false;
  }
}

async function drawFromReferences(
  operation: VisionCostOperation,
  prompt: string,
  references: ImageReference[],
  photoBytes: Buffer,
  printPrefs: PrintPrefs,
  hint?: PhotoImageSizeHint,
  /** Sheet being edited; the result is matched to its stroke weight. */
  weightReferenceBase64?: string,
): Promise<GeneratedSheet> {
  const layout = await layoutForPhotoBytes(photoBytes, printPrefs, hint);
  const images = createImageGenerator();
  const request = { operation, prompt, references, layout, purpose: "lineArt" as const };

  let file = await images.generate(request);

  // The model sometimes ignores the requested aspect ratio. Check, retry once
  // with a firm correction, then fit onto the right canvas as a last resort.
  if (await isWrongWayRound(file, layout)) {
    try {
      file = await images.generate({ ...request, followUps: [photoLayoutRetryNote(layout)] });
    } catch {
      /* keep the first image; it is fitted below */
    }
    if (await isWrongWayRound(file, layout)) {
      file = await fitToLayout(file, layout);
    }
  }

  return toSheet(file, printPrefs.showTitle, weightReferenceBase64);
}

/** Landscape canvas for a portrait photo: 4:3, the same page turned on its side. */
function landscapeLayoutFor(source: PhotoLayout): PhotoLayout {
  const longEdge = Math.max(source.width, source.height);
  return {
    orientation: "landscape",
    aspectRatio: "4:3",
    width: longEdge,
    height: Math.round(longEdge * 0.75),
  };
}

/** Portrait canvas for a landscape photo: 3:4 sits best on a printed page. */
function portraitLayoutFor(source: PhotoLayout): PhotoLayout {
  const longEdge = Math.max(source.width, source.height);
  return {
    orientation: "portrait",
    aspectRatio: "3:4",
    width: Math.round(longEdge * 0.75),
    height: longEdge,
  };
}

export function createPhotoHandlers(): Pick<
  ColoringAI,
  "photoToColoring" | "correctPhotoColoring" | "photoToPortrait"
> {
  return {
    async photoToPortrait(input: PhotoPortraitRequest): Promise<GeneratedPhoto> {
      const photo = await photoForModel(parsePhotoDataUrl(input.photoDataUrl));
      const want = input.target ?? "portrait";
      const from = want === "portrait" ? "landscape" : "portrait";
      const source = await layoutForPhotoBytes(photo.bytes, { ...defaultPrintPrefs, orientation: from }, input.image);
      if (source.orientation !== from) {
        throw new Error(alreadyOrientedMessage(want));
      }
      const target = want === "portrait" ? portraitLayoutFor(source) : landscapeLayoutFor(source);
      const images = createImageGenerator();
      const request = {
        operation: "photoToPortrait" as const,
        prompt: buildPhotoPortraitPrompt(source, target),
        references: [
          {
            base64: photo.base64,
            mediaType: photo.mediaType,
            caption:
              "REFERENCE PHOTOGRAPH — the people and key content here must all appear in the result, unchanged.",
          },
        ],
        layout: target,
        purpose: "photo" as const,
      };

      let file = await images.generate(request);
      if (await isWrongWayRound(file, target)) {
        file = await images.generate({
          ...request,
          followUps: [
            want === "portrait"
              ? `CORRECTION: the previous attempt was not portrait. Produce the same photograph again on a PORTRAIT canvas (${target.aspectRatio}) that is taller than it is wide. Do not rotate the scene or turn it on its side.`
              : `CORRECTION: the previous attempt was not landscape. Produce the same photograph again on a LANDSCAPE canvas (${target.aspectRatio}) that is wider than it is tall. Do not rotate the scene or turn it on its side.`,
          ],
        });
        // Padding a photo onto a white canvas is not a portrait photo; let the caller retry.
        if (await isWrongWayRound(file, target)) {
          throw new Error(`Could not reframe this photo as ${want === "portrait" ? "a portrait" : "a landscape"}. Please try again.`);
        }
      }

      const { data, info } = await sharp(Buffer.from(file.base64, "base64"))
        .rotate()
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      return {
        imageDataUrl: `data:image/jpeg;base64,${data.toString("base64")}`,
        mimeType: "image/jpeg",
        width: info.width,
        height: info.height,
      };
    },

    async photoToColoring(input: PhotoColoringGenerateRequest) {
      const photo = await photoForModel(parsePhotoDataUrl(input.photoDataUrl));
      const layout = await layoutForPhotoBytes(photo.bytes, input.printPrefs, input.image);
      const prompt = buildPhotoColoringPrompt(input.printPrefs, layout);

      return drawFromReferences(
        "photoToColoring",
        prompt,
        [
          {
            base64: photo.base64,
            mediaType: photo.mediaType,
            caption:
              "REFERENCE PHOTOGRAPH — trace the FULL frame faithfully (all people, full width). Outlines only: never fill regions with solid black. Do not zoom, crop, or add background scribbles.",
          },
        ],
        photo.bytes,
        input.printPrefs,
        input.image,
      );
    },

    async correctPhotoColoring(input: PhotoColoringCorrectRequest) {
      const photo = await photoForModel(parsePhotoDataUrl(input.photoDataUrl));
      const sheet = parsePhotoDataUrl(input.sheetDataUrl);
      const sheetInput = await sheetForModel(sheet);
      const layout = await layoutForPhotoBytes(photo.bytes, input.printPrefs, input.image);
      const prompt = buildPhotoCorrectionPrompt(
        input.printPrefs,
        input.corrections,
        layout,
      );

      // The current sheet goes first: it is the page being edited, and the image models hold the
      // first input most faithfully. With the photo first, a second edit was redrawn from the
      // photo and quietly undid the earlier ones.
      return drawFromReferences(
        "correctPhotoColoring",
        prompt,
        [
          {
            base64: sheetInput.base64,
            mediaType: sheetInput.mediaType,
            caption:
              "CURRENT COLORING SHEET — the page to edit. It already includes the user's earlier edits; keep everything on it, with the same line weight and layout, except what the new requests change.",
          },
          {
            base64: photo.base64,
            mediaType: photo.mediaType,
            caption:
              "ORIGINAL PHOTOGRAPH — reference only, for the look of details a request asks about. Do not redraw the page from it or undo differences between it and the current sheet.",
          },
        ],
        photo.bytes,
        input.printPrefs,
        input.image,
        sheet.base64,
      );
    },
  };
}
