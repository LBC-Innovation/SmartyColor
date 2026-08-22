import "server-only";

import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { toLineArtPng } from "@/lib/print/lineArt";
import {
  buildGeneratePrompt,
  buildImageFilterRewritePrompt,
  buildRefineUserPrompt,
  IMAGE_FILTER_REWRITE_SYSTEM,
  isScenePlanPoint,
  REFINE_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import type { ColoringAI, GenerateOptions } from "@/lib/ai/types";
import type { FeedbackPoint, FeedbackTurn, GeneratedSheet } from "@/lib/session/types";
import { sanitizeSecretText } from "@/lib/security/publicError";

const refineSchema = z.object({
  kind: z.enum(["ok", "workaround", "blocked"]),
  kidMessage: z.string(),
  points: z
    .array(
      z.object({
        text: z.string(),
      }),
    )
    .max(8),
  /** Current-plan texts to drop when applying an edit delta. */
  removeFromPlan: z.array(z.string()).max(12).optional(),
  workaroundOriginalIntent: z.string().optional(),
  workaroundSuggestion: z.string().optional(),
  saferIdea: z.string().optional(),
  title: z.string().optional(),
});

const imageFilterRewriteSchema = z.object({
  likelyTrigger: z.string(),
  safeSubject: z.string(),
  safePlanDetails: z.array(z.string()).min(2).max(8),
  keepForRecognition: z.string(),
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
  process.env.GEMINI_REFINE_MODEL?.trim() ||
  process.env.GEMINI_MODEL?.trim() ||
  "gemini-3.5-flash-lite";
const imageModel =
  process.env.GEMINI_IMAGE_MODEL?.trim() ||
  "gemini-3.1-flash-image-preview";

function newId() {
  return crypto.randomUUID();
}

async function toSheet(
  file: { base64: string; mediaType: string },
  title: string,
  showTitle: boolean,
): Promise<GeneratedSheet> {
  const lineArtBase64 = await toLineArtPng(file.base64);
  return {
    title: showTitle ? title : "Coloring sheet",
    imageDataUrl: `data:image/png;base64,${lineArtBase64}`,
    mimeType: "image/png",
  };
}

function pickImageFile(
  files:
    | Array<{ mediaType: string; base64: string; uint8Array: Uint8Array }>
    | undefined,
) {
  if (!files?.length) return undefined;
  return (
    files.find((file) => file.mediaType?.toLowerCase().startsWith("image/")) ??
    files.find((file) => (file.uint8Array?.byteLength ?? 0) > 500)
  );
}

type DrawResult = {
  file:
    | { base64: string; mediaType: string; uint8Array: Uint8Array }
    | undefined;
  text: string;
  finishReason: string;
  errorMessage: string;
};

function shouldRewriteForFilter(result: DrawResult) {
  if (result.file) return false;
  const blob = `${result.errorMessage}\n${result.text}\n${result.finishReason}`;
  return (
    result.finishReason === "content-filter" ||
    /copyright|trademark|owned|celebrity|character|blocked|policy|can't|cannot|unable|no picture|safety|filter/i.test(
      blob,
    )
  );
}

export function createGeminiProvider(): ColoringAI {
  return {
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

      const editingPreviousSheet = Boolean(
        input.editingPreviousSheet ?? input.session?.editingPreviousSheet,
      );

      if (!editingPreviousSheet) {
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
      }

      const turn: FeedbackTurn = {
        kind: output.kind,
        kidMessage: output.kidMessage,
        points,
        removeFromPlan: (output.removeFromPlan ?? [])
          .map((text) => text.trim())
          .filter(Boolean),
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

    async generate(input, options?: GenerateOptions) {
      const report = options?.onProgress;
      const session = input.session;
      const planTexts = session.likes
        .map((like) => like.text)
        .filter(isScenePlanPoint);
      const title = session.printPrefs.showTitle
        ? planTexts[0]?.split(",")[0] ||
          session.idea.slice(0, 42) ||
          "My coloring sheet"
        : "Coloring sheet";
      const prompt = buildGeneratePrompt({
        idea: session.idea,
        likes: planTexts,
        printPrefs: session.printPrefs,
        title,
        editingPreviousSheet: Boolean(session.editingPreviousSheet),
      });

      const aspectRatio =
        session.printPrefs.orientation === "landscape" ? "4:3" : "3:4";

      const imageOptions = {
        ...googleSafety,
        google: {
          ...googleSafety.google,
          responseModalities: ["TEXT", "IMAGE"] as ("TEXT" | "IMAGE")[],
          imageConfig: {
            aspectRatio,
            imageSize: "2K" as "1K" | "2K",
          },
        },
      };

      async function draw(
        nextPrompt: string,
        imageSize: "1K" | "2K" = "2K",
      ): Promise<DrawResult> {
        try {
          const result = await generateText({
            model: google(imageModel),
            prompt: nextPrompt,
            providerOptions: {
              ...imageOptions,
              google: {
                ...imageOptions.google,
                imageConfig: {
                  ...imageOptions.google.imageConfig,
                  imageSize,
                },
              },
            },
          });

          return {
            file: pickImageFile(result.files),
            text: result.text?.trim() || "",
            finishReason: String(result.finishReason || ""),
            errorMessage: "",
          };
        } catch (error) {
          return {
            file: undefined,
            text: "",
            finishReason: "error",
            errorMessage: sanitizeSecretText(
              error instanceof Error ? error.message : String(error),
            ),
          };
        }
      }

      async function rewriteFilteredRequest(
        failure: DrawResult,
        previousSafeSubject?: string,
      ) {
        const { output } = await generateText({
          model: google(refineModel),
          system: IMAGE_FILTER_REWRITE_SYSTEM,
          prompt: buildImageFilterRewritePrompt({
            idea: session.idea,
            planDetails: planTexts,
            finishReason: failure.finishReason,
            modelText: sanitizeSecretText(failure.text),
            errorMessage: sanitizeSecretText(failure.errorMessage),
            previousSafeSubject,
          }),
          output: Output.object({ schema: imageFilterRewriteSchema }),
          providerOptions: googleSafety,
        });

        if (!output?.safeSubject?.trim()) {
          throw new Error("Could not rewrite that idea safely.");
        }

        return output;
      }

      report?.({
        stage: "drawing",
        title: "Making your coloring sheet…",
        detail:
          "Sharpening crayons. Drawing big shapes. Saving the tiny details for last.",
      });

      const first = await draw(prompt, "2K");
      if (first.file) {
        report?.({
          stage: "finishing",
          title: "Almost ready…",
          detail: "Putting the finishing touches on your page.",
        });
        return toSheet(first.file, title, session.printPrefs.showTitle);
      }

      if (!shouldRewriteForFilter(first)) {
        throw new Error("No picture came back.");
      }

      let previous: DrawResult = first;
      let previousSafeSubject: string | undefined;

      for (let attempt = 0; attempt < 2; attempt++) {
        report?.({
          stage: "filtered",
          title: "Tweaking the idea…",
          detail:
            "That version got stuck on a famous look. Smarty is rewriting it so we can still draw something super close.",
        });

        report?.({
          stage: "rewriting",
          title: "Finding a close look-alike…",
          detail:
            "Describing the costume, pose, and scene without the words that blocked the drawing.",
        });

        const rewrite = await rewriteFilteredRequest(
          previous,
          previousSafeSubject,
        );
        previousSafeSubject = rewrite.safeSubject;

        const rewrittenPrompt = buildGeneratePrompt({
          idea: rewrite.safeSubject,
          likes: rewrite.safePlanDetails,
          printPrefs: session.printPrefs,
          title,
          editingPreviousSheet: Boolean(session.editingPreviousSheet),
        });

        report?.({
          stage: "retrying",
          title:
            attempt === 0
              ? "Drawing the look-alike…"
              : "Trying one more careful draw…",
          detail:
            "Same adventure, safer wording — black outlines coming right up.",
        });

        const retry = await draw(
          `${rewrittenPrompt}

Draw this as a near look-alike coloring page. Keep these recognition anchors: ${rewrite.keepForRecognition}
Do not use brand or character names. Output an IMAGE — black outlines on white only.`,
          "1K",
        );

        if (retry.file) {
          report?.({
            stage: "finishing",
            title: "Got it!",
            detail: "Putting the finishing touches on your page.",
          });
          return toSheet(retry.file, title, session.printPrefs.showTitle);
        }

        previous = retry;
        if (!shouldRewriteForFilter(retry)) break;
      }

      throw new Error(
        "We couldn't get a drawing through yet. Try one more detail about how the character looks (outfit, hair, pose) without using their official name.",
      );
    },
  };
}
