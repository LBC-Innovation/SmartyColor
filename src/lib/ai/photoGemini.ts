import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import sharp from "sharp";
import {
  buildPhotoColoringPrompt,
  buildPhotoCorrectionPrompt,
} from "@/lib/ai/prompts";
import { parsePhotoDataUrl } from "@/lib/ai/photoDataUrl";
import { inferPhotoLayout } from "@/lib/photo/orientation";
import type { ColoringAI } from "@/lib/ai/types";
import { toPhotoLineArtPng } from "@/lib/print/lineArt";
import type { PrintPrefs } from "@/lib/print/settings";
import type {
  PhotoColoringCorrectRequest,
  PhotoColoringGenerateRequest,
} from "@/lib/session/photoTypes";
import type { GeneratedSheet } from "@/lib/session/types";

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
  process.env.GEMINI_IMAGE_MODEL?.trim() ||
  "gemini-3.1-flash-image-preview";

async function layoutForPhotoBytes(bytes: Buffer, printPrefs: PrintPrefs) {
  try {
    const meta = await sharp(bytes).metadata();
    if (meta.width && meta.height) {
      return inferPhotoLayout(meta.width, meta.height);
    }
  } catch {
    /* fall through */
  }
  return inferPhotoLayout(
    printPrefs.orientation === "landscape" ? 1600 : 1200,
    printPrefs.orientation === "landscape" ? 900 : 1600,
  );
}

async function toSheet(
  file: { base64: string; mediaType: string },
  showTitle: boolean,
): Promise<GeneratedSheet> {
  const lineArtBase64 = await toPhotoLineArtPng(file.base64);
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

async function drawFromReferences(
  prompt: string,
  references: ReferenceImage[],
  photoBytes: Buffer,
  printPrefs: PrintPrefs,
): Promise<GeneratedSheet> {
  const layout = await layoutForPhotoBytes(photoBytes, printPrefs);

  const imageOptions = {
    ...googleSafety,
    google: {
      ...googleSafety.google,
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: layout.aspectRatio,
        imageSize: "2K",
      },
    },
  };

  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: string; mediaType: string }
  > = [];

  for (const ref of references) {
    content.push({ type: "text", text: ref.caption });
    content.push({
      type: "file",
      data: ref.base64,
      mediaType: ref.mediaType,
    });
  }
  content.push({ type: "text", text: prompt });

  const result = await generateText({
    model: google(imageModel),
    messages: [{ role: "user", content }],
    providerOptions: imageOptions,
  });

  const file = result.files.find((item) => item.mediaType.startsWith("image/"));
  if (!file) {
    throw new Error("No coloring sheet came back from the photo.");
  }

  return toSheet(file, printPrefs.showTitle);
}

export function createPhotoGeminiHandlers(): Pick<
  ColoringAI,
  "photoToColoring" | "correctPhotoColoring"
> {
  return {
    async photoToColoring(input: PhotoColoringGenerateRequest) {
      const photo = parsePhotoDataUrl(input.photoDataUrl);
      const layout = await layoutForPhotoBytes(photo.bytes, input.printPrefs);
      const prompt = buildPhotoColoringPrompt(input.printPrefs, layout);

      return drawFromReferences(
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
      );
    },

    async correctPhotoColoring(input: PhotoColoringCorrectRequest) {
      const photo = parsePhotoDataUrl(input.photoDataUrl);
      const sheet = parsePhotoDataUrl(input.sheetDataUrl);
      const layout = await layoutForPhotoBytes(photo.bytes, input.printPrefs);
      const prompt = buildPhotoCorrectionPrompt(
        input.printPrefs,
        input.corrections,
        layout,
      );

      return drawFromReferences(
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
              "PREVIOUS COLORING ATTEMPT — improve it using the fix list; do not restart from scratch.",
          },
        ],
        photo.bytes,
        input.printPrefs,
      );
    },
  };
}
