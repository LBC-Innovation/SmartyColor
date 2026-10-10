import { createColoringAI } from "@/lib/ai/createProvider";
import { defaultPrintPrefs } from "@/lib/print/settings";
import type { RefineRequest } from "@/lib/session/types";

export async function POST(request: Request) {
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

    return Response.json({
      sessionId: body.session?.id ?? crypto.randomUUID(),
      feedback,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "We could not hear that idea yet.";
    return Response.json({ error: message }, { status: 500 });
  }
}
