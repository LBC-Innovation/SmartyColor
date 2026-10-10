import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { trackVisionGenerateText } from "@/lib/visionCost/trackGenerateText";
import {
  buildStoryGeneratePrompt,
  buildStoryPhotoChatPrompt,
  STORYBOOK_GENERATE_SYSTEM,
  STORYBOOK_PHOTO_CHAT_SYSTEM,
} from "@/lib/ai/storybookPrompts";
import { parsePhotoDataUrl } from "@/lib/ai/photoDataUrl";
import type { StoryChatMessage, V2GeneratedStory } from "@/lib/v2/storybookTypes";

const textModel =
  process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

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

const storySchema = z.object({
  title: z.string(),
  introduction: z.string(),
  pages: z
    .array(
      z.object({
        photoIndex: z.number().int().nonnegative(),
        text: z.string(),
      }),
    )
    .min(1),
  closing: z.string(),
});

function extractPhotoSummary(text: string): {
  reply: string;
  photoSummary: string | null;
} {
  const marker = "PHOTO_SUMMARY:";
  const idx = text.lastIndexOf(marker);
  if (idx < 0) {
    return { reply: text.trim(), photoSummary: null };
  }
  const reply = text.slice(0, idx).trim();
  const photoSummary = text.slice(idx + marker.length).trim() || null;
  return { reply, photoSummary };
}

export async function storybookPhotoChat(input: {
  albumTitle: string;
  tripNarrative: string;
  familyContext: string;
  userCaption: string;
  photoSummary: string | null;
  history: StoryChatMessage[];
  userMessage: string;
  photoDataUrl?: string;
}): Promise<{ assistantMessage: string; photoSummary: string | null }> {
  const prompt = buildStoryPhotoChatPrompt(input);

  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: string; mediaType: string }
  > = [{ type: "text", text: prompt }];

  if (input.photoDataUrl) {
    const parsed = parsePhotoDataUrl(input.photoDataUrl);
    content.unshift({
      type: "file",
      data: parsed.base64,
      mediaType: parsed.mediaType,
    });
  }

  const result = await trackVisionGenerateText("storybookPhotoChat", {
    model: google(textModel),
    system: STORYBOOK_PHOTO_CHAT_SYSTEM,
    messages: [{ role: "user", content }],
    providerOptions: googleSafety,
  });

  const raw = result.text.trim();
  const { reply, photoSummary } = extractPhotoSummary(raw);
  return {
    assistantMessage: reply || raw,
    photoSummary: photoSummary ?? input.photoSummary,
  };
}

export async function storybookGenerateStory(input: {
  albumTitle: string;
  tripNarrative: string;
  familyContext: string;
  photoIds: string[];
  photos: Array<{
    capturedAt: string;
    userCaption: string;
    photoSummary: string | null;
  }>;
}): Promise<V2GeneratedStory> {
  const prompt = buildStoryGeneratePrompt({
    albumTitle: input.albumTitle,
    tripNarrative: input.tripNarrative,
    familyContext: input.familyContext,
    photos: input.photos.map((p, index) => ({ ...p, index })),
  });

  const { output } = await trackVisionGenerateText("storybookGenerate", {
    model: google(textModel),
    system: STORYBOOK_GENERATE_SYSTEM,
    prompt,
    output: Output.object({ schema: storySchema }),
    providerOptions: googleSafety,
  });

  if (!output) {
    throw new Error("The story helper did not return a story.");
  }

  const pages = [...output.pages]
    .sort(
      (a: { photoIndex: number }, b: { photoIndex: number }) =>
        a.photoIndex - b.photoIndex,
    )
    .map((page: { photoIndex: number; text: string }) => {
      const photoId = input.photoIds[page.photoIndex];
      if (!photoId) {
        throw new Error("Story page references an unknown photo.");
      }
      return { photoId, text: page.text.trim() };
    });

  return {
    title: output.title.trim(),
    introduction: output.introduction.trim(),
    pages,
    closing: output.closing.trim(),
    generatedAt: new Date().toISOString(),
  };
}

export function storybookStubPhotoChat(input: {
  userMessage: string;
  photoSummary: string | null;
}): { assistantMessage: string; photoSummary: string | null } {
  const assistantMessage = `Thanks! I heard: "${input.userMessage.slice(0, 120)}". What did the kids love most in this moment?`;
  const photoSummary =
    input.photoSummary ??
    `A special moment from the trip: ${input.userMessage.slice(0, 80)}`;
  return { assistantMessage, photoSummary };
}

export function storybookStubGenerate(input: {
  albumTitle: string;
  photoIds: string[];
}): V2GeneratedStory {
  const title = input.albumTitle.trim() || "Our big adventure";
  return {
    title,
    introduction:
      "Once upon a time, our family packed our bags and set off on a trip we would never forget.",
    pages: input.photoIds.map((photoId, index) => ({
      photoId,
      text: `On day ${index + 1}, we smiled, explored, and made a memory that felt like magic.`,
    })),
    closing: "And when we came home, we knew this adventure would live in our hearts forever.",
    generatedAt: new Date().toISOString(),
  };
}
