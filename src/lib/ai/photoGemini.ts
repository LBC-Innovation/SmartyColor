import { trackVisionGenerateText } from "@/lib/visionCost/trackGenerateText";
import { google } from "@ai-sdk/google";
import sharp from "sharp";
import {
  buildPhotoColoringPrompt,
  buildPhotoCorrectionPrompt,
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
import type { ColoringAI } from "@/lib/ai/types";
import { toPhotoLineArtPng } from "@/lib/print/lineArt";
import type { PrintPrefs } from "@/lib/print/settings";
import type {
  PhotoColoringCorrectRequest,
  PhotoColoringGenerateRequest,
  PhotoImageSizeHint,
} from "@/lib/session/photoTypes";
import type { GeneratedSheet } from "@/lib/session/types";
import type { VisionCostOperation } from "@/lib/visionCost/types";
import { generateGeminiImageViaRest } from "@/lib/ai/geminiImageGenerateRest";

const googleSafety = {
  google: {
    safetySettings: [
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT" as const,
        threshold: "BLOCK_LOW_AND_ABOVE" as const,
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT" as const,
        threshold: "BLOCK_MEDIUM_AND_ABOVE" as const,
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH" as const,
        threshold: "BLOCK_MEDIUM_AND_ABOVE" as const,
      },
      {
        category: "HARM_CATEGORY_HARASSMENT" as const,
        threshold: "BLOCK_MEDIUM_AND_ABOVE" as const,
      },
    ],
  },
};

const imageModel =
  process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";

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
 * Bake EXIF rotation into the pixels so the model sees the same upright photo
 * the layout was measured from. Anything sharp cannot decode passes through.
 */
async function uprightPhoto(photo: ParsedPhoto): Promise<ParsedPhoto> {
  try {
    const meta = await sharp(photo.bytes).metadata();
    if (!meta.orientation || meta.orientation === 1) return photo;
    const bytes = await sharp(photo.bytes)
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    return { bytes, base64: bytes.toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return photo;
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
    title: showTitle ? "My photo coloring page" : "Coloring sheet",
    imageDataUrl: `data:image/png;base64,${lineArtBase64}`,
    mimeType: "image/png",
  };
}

type ReferenceImage = {
  base64: string;
  mediaType: string;
  caption: string;
};

type MessageContent = Array<
  | { type: "text"; text: string }
  | { type: "file"; data: string; mediaType: string }
>;

function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid json response|unable to process input image|invalid argument|internal error|resource exhausted|fetch failed|ECONNRESET|503|429|502|504/i.test(
    message,
  );
}

function buildImageProviderOptions(
  layout: PhotoLayout,
  options: {
    imageSize?: "1K" | "2K";
    responseModalities?: Array<"TEXT" | "IMAGE">;
  } = {},
) {
  const imageConfig: { aspectRatio: PhotoLayout["aspectRatio"]; imageSize?: string } =
    {
      aspectRatio: layout.aspectRatio,
    };
  if (options.imageSize) {
    imageConfig.imageSize = options.imageSize;
  }

  return {
    ...googleSafety,
    google: {
      ...googleSafety.google,
      responseModalities: options.responseModalities ?? ["TEXT", "IMAGE"],
      imageConfig,
    },
  };
}

function pickImageFile(
  files: Array<{ base64: string; mediaType: string }>,
) {
  const imageFiles = files.filter((item) => item.mediaType.startsWith("image/"));
  return imageFiles.length > 0 ? imageFiles[imageFiles.length - 1] : undefined;
}

function messageContentToRestParts(content: MessageContent) {
  return content.map((part) =>
    part.type === "text"
      ? { text: part.text }
      : {
          inlineData: {
            mimeType: part.mediaType,
            data: part.data,
          },
        },
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateImageFileFromReferences(
  operation: VisionCostOperation,
  content: MessageContent,
  layout: PhotoLayout,
): Promise<{ base64: string; mediaType: string }> {
  const attempts: Array<{
    imageSize?: "1K" | "2K";
    responseModalities?: Array<"TEXT" | "IMAGE">;
  }> = [
    { imageSize: "1K" },
    { imageSize: "1K", responseModalities: ["IMAGE"] },
    {},
    { imageSize: "2K" },
  ];

  let lastError: unknown;
  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index];
    if (index > 0) {
      await sleep(350);
    }
    try {
      const result = await trackVisionGenerateText(operation, {
        model: google(imageModel),
        messages: [{ role: "user", content }],
        providerOptions: buildImageProviderOptions(layout, attempt),
        maxRetries: 2,
      });
      const file = pickImageFile(result.files);
      if (file) return file;
      throw new Error("No image file in model response.");
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error)) {
        break;
      }
    }
  }

  try {
    return await generateGeminiImageViaRest(
      messageContentToRestParts(content),
      layout,
      operation,
    );
  } catch (restError) {
    if (lastError instanceof Error && isRetryableGeminiError(lastError)) {
      throw restError;
    }
    throw lastError instanceof Error ? lastError : restError;
  }
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
  references: ReferenceImage[],
  photoBytes: Buffer,
  printPrefs: PrintPrefs,
  hint?: PhotoImageSizeHint,
  /** Sheet being edited; the result is matched to its stroke weight. */
  weightReferenceBase64?: string,
): Promise<GeneratedSheet> {
  const layout = await layoutForPhotoBytes(photoBytes, printPrefs, hint);

  const content: MessageContent = [];

  for (const ref of references) {
    content.push({ type: "text", text: ref.caption });
    content.push({
      type: "file",
      data: ref.base64,
      mediaType: ref.mediaType,
    });
  }
  content.push({ type: "text", text: prompt });

  let file = await generateImageFileFromReferences(operation, content, layout);

  // The model sometimes ignores the requested aspect ratio. Check, retry once
  // with a firm correction, then fit onto the right canvas as a last resort.
  if (await isWrongWayRound(file, layout)) {
    try {
      const retried = await generateImageFileFromReferences(
        operation,
        [...content, { type: "text", text: photoLayoutRetryNote(layout) }],
        layout,
      );
      file = retried;
    } catch {
      /* keep the first image; it is fitted below */
    }
    if (await isWrongWayRound(file, layout)) {
      file = await fitToLayout(file, layout);
    }
  }

  return toSheet(file, printPrefs.showTitle, weightReferenceBase64);
}

export function createPhotoGeminiHandlers(): Pick<
  ColoringAI,
  "photoToColoring" | "correctPhotoColoring"
> {
  return {
    async photoToColoring(input: PhotoColoringGenerateRequest) {
      const photo = await uprightPhoto(parsePhotoDataUrl(input.photoDataUrl));
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
      const photo = await uprightPhoto(parsePhotoDataUrl(input.photoDataUrl));
      const sheet = parsePhotoDataUrl(input.sheetDataUrl);
      const layout = await layoutForPhotoBytes(photo.bytes, input.printPrefs, input.image);
      const prompt = buildPhotoCorrectionPrompt(
        input.printPrefs,
        input.corrections,
        layout,
      );

      return drawFromReferences(
        "correctPhotoColoring",
        prompt,
        [
          {
            base64: photo.base64,
            mediaType: photo.mediaType,
            caption: "ORIGINAL PHOTOGRAPH — ground truth for what should appear.",
          },
          {
            base64: sheet.base64,
            mediaType: sheet.mediaType,
            caption:
              "PREVIOUS COLORING ATTEMPT — match its line weight and layout exactly for unchanged areas. Output one full replacement sheet; do not draw on top of this image or retrace existing lines.",
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
