import { createColoringAI } from "@/lib/ai/createProvider";
import { defaultPrintPrefs } from "@/lib/print/settings";
import { toPublicErrorMessage } from "@/lib/security/publicError";
import type { RefineRequest } from "@/lib/session/types";

export async function POST(request: Request) {
  const started = performance.now();
  try {
    const body = (await request.json()) as RefineRequest;
    if (!body.idea?.trim()) {
      return Response.json(
        { error: "Tell us what you want to color!" },
        { status: 400 },
      );
    }

    const ai = createColoringAI();
    const feedback = await ai.refine({
      ...body,
      printPrefs: body.printPrefs ?? defaultPrintPrefs,
      likes: body.likes ?? [],
    });

    if (process.env.NODE_ENV === "development") {
      console.info(
        `[refine] ${Math.round(performance.now() - started)}ms`,
      );
    }

    return Response.json({
      sessionId: body.session?.id ?? crypto.randomUUID(),
      feedback,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.info(
        `[refine] failed after ${Math.round(performance.now() - started)}ms`,
      );
    }
    return Response.json(
      {
        error: toPublicErrorMessage(
          error,
          "We could not hear that idea yet.",
        ),
      },
      { status: 500 },
    );
  }
}
