import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { toLineArtPng } from "@/lib/print/lineArt";
import {
  buildGeneratePrompt,
  buildRefineUserPrompt,
  isScenePlanPoint,
  REFINE_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import { createImageGenerator } from "@/lib/ai/image";
import { createPhotoHandlers } from "@/lib/ai/photoHandlers";
import type { PhotoLayout } from "@/lib/photo/orientation";
import type { ColoringAI } from "@/lib/ai/types";
import type { FeedbackPoint, FeedbackTurn, GeneratedSheet } from "@/lib/session/types";

const refineSchema = z.object({
  kind: z.enum(["ok", "workaround", "blocked"]),
  kidMessage: z.string(),
  points: z
    .array(
      z.object({
        text: z.string(),
      }),
    )
    .min(2)
    .max(6),
  workaroundOriginalIntent: z.string().optional(),
  workaroundSuggestion: z.string().optional(),
  saferIdea: z.string().optional(),
  title: z.string().optional(),
});

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

const refineModel =
  process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

function newId() {
  return crypto.randomUUID();
}

/** Canvas for a text-to-image sheet; only orientation and aspect ratio matter. */
function sheetLayout(orientation: "portrait" | "landscape"): PhotoLayout {
  return orientation === "landscape"
    ? { orientation, aspectRatio: "4:3", width: 1600, height: 1200 }
    : { orientation, aspectRatio: "3:4", width: 1200, height: 1600 };
}

async function toSheet(
  file: { base64: string; mediaType: string },
  title: string,
  showTitle: boolean,
): Promise<GeneratedSheet> {
  const lineArtBase64 = await toLineArtPng(file.base64);
  return {
    title: showTitle ? title : "Coloring page",
    imageDataUrl: `data:image/png;base64,${lineArtBase64}`,
    mimeType: "image/png",
  };
}

export function createGeminiProvider(): ColoringAI {
  const photo = createPhotoHandlers();

  return {
    ...photo,
    async refine(input) {
      const { output } = await generateText({
        model: google(refineModel),
        system: REFINE_SYSTEM_PROMPT,
        prompt: buildRefineUserPrompt(input),
        output: Output.object({ schema: refineSchema }),
        providerOptions: googleSafety,
      });

      if (!output) {
        throw new Error("The drawing helper did not send a plan back.");
      }

      const points: FeedbackPoint[] = output.points
        .filter((point) => isScenePlanPoint(point.text))
        .map((point) => ({
          id: newId(),
          text: point.text,
        }));

      if (points.length === 0) {
        points.push({
          id: newId(),
          text: input.idea.trim() || "A fun scene to color",
        });
      }
      if (points.length === 1) {
        points.push({
          id: newId(),
          text: `Keep the page ${input.printPrefs.detail} — not too crowded`,
        });
      }

      const turn: FeedbackTurn = {
        kind: output.kind,
        kidMessage: output.kidMessage,
        points,
        saferIdea: output.saferIdea,
      };

      if (output.kind === "workaround") {
        turn.workaround = {
          originalIntent:
            output.workaroundOriginalIntent || input.idea,
          suggestion:
            output.workaroundSuggestion || output.kidMessage,
        };
      }

      return turn;
    },

    async generate(input) {
      const session = input.session;
      const planTexts = session.likes
        .map((like) => like.text)
        .filter(isScenePlanPoint);
      const title = session.printPrefs.showTitle
        ? planTexts[0]?.split(",")[0] ||
          session.idea.slice(0, 42) ||
          "My coloring page"
        : "Coloring page";
      const prompt = buildGeneratePrompt({
        idea: session.idea,
        likes: planTexts,
        printPrefs: session.printPrefs,
        title,
      });

      const images = createImageGenerator();
      const request = {
        operation: "generateImage" as const,
        prompt,
        references: [],
        layout: sheetLayout(session.printPrefs.orientation),
        purpose: "lineArt" as const,
      };

      try {
        const file = await images.generate(request);
        return toSheet(file, title, session.printPrefs.showTitle);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const looksLikeOwnedContent =
          /copyright|trademark|owned|celebrity|character/i.test(message);

        if (!looksLikeOwnedContent) {
          throw error;
        }

        const file = await images.generate({
          ...request,
          followUps: [
            `The last try was blocked for looking too much like a protected brand. Redraw the SAME request as a near look-alike coloring-page outline: keep the same character type, costume shapes, colors-as-empty-regions, pose, gear, companion, and setting so a kid would still say "that's what I asked for." Change only logos, brand text, and exact trademark emblems. Do not invent a totally different character or scene. Black outlines on white only — no filled color.`,
          ],
        });
        return toSheet(file, title, session.printPrefs.showTitle);
      }
    },
  };
}
