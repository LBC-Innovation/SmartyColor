import {
  assertTotalJsonBodyWithinBudget,
  ensurePhotoDataUrlForRequest,
} from "@/lib/ai/compressPhotoServer";
import { createColoringAI } from "@/lib/ai/createProvider";
import { normalizeCorrections, parsePhotoDataUrl } from "@/lib/ai/photoDataUrl";
import { estimateJsonBodyBytes } from "@/lib/photo/payloadBudget";
import { defaultPrintPrefs, type PrintPrefs } from "@/lib/print/settings";
import {
  PHOTO_MAX_CORRECTIONS,
  PHOTO_MAX_CORRECTION_CHARS,
} from "@/lib/session/photoTypes";

export const maxDuration = 120;

type Body =
  | {
      mode: "generate";
      photoDataUrl: string;
      printPrefs?: PrintPrefs;
    }
  | {
      mode: "correct";
      photoDataUrl: string;
      sheetDataUrl: string;
      corrections: string[];
      printPrefs?: PrintPrefs;
    };

function mergePrintPrefs(raw?: PrintPrefs): PrintPrefs {
  if (!raw) return defaultPrintPrefs;
  return { ...defaultPrintPrefs, ...raw };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const printPrefs = mergePrintPrefs(body.printPrefs);
    const ai = createColoringAI();

    if (body.mode === "generate") {
      if (!body.photoDataUrl?.trim()) {
        return Response.json({ error: "Pick a photo first." }, { status: 400 });
      }
      parsePhotoDataUrl(body.photoDataUrl);
      const photo = await ensurePhotoDataUrlForRequest(body.photoDataUrl, 1);
      assertTotalJsonBodyWithinBudget(
        estimateJsonBodyBytes({ photoDataUrl: photo.dataUrl }),
      );
      const sheet = await ai.photoToColoring({
        photoDataUrl: photo.dataUrl,
        printPrefs,
      });
      return Response.json({ sheet });
    }

    if (body.mode === "correct") {
      if (!body.photoDataUrl?.trim() || !body.sheetDataUrl?.trim()) {
        return Response.json(
          { error: "Need the photo and the current coloring sheet." },
          { status: 400 },
        );
      }
      const corrections = normalizeCorrections(body.corrections);
      if (corrections.length === 0) {
        return Response.json(
          { error: "Add at least one short note about what to fix." },
          { status: 400 },
        );
      }
      if (corrections.length > PHOTO_MAX_CORRECTIONS) {
        return Response.json(
          {
            error: `Please keep it to ${PHOTO_MAX_CORRECTIONS} fix notes at a time.`,
          },
          { status: 400 },
        );
      }
      for (const line of corrections) {
        if (line.length > PHOTO_MAX_CORRECTION_CHARS) {
          return Response.json(
            { error: "Each fix note should be shorter." },
            { status: 400 },
          );
        }
      }
      parsePhotoDataUrl(body.photoDataUrl);
      parsePhotoDataUrl(body.sheetDataUrl);
      const photo = await ensurePhotoDataUrlForRequest(body.photoDataUrl, 2);
      const currentSheet = await ensurePhotoDataUrlForRequest(
        body.sheetDataUrl,
        2,
      );
      assertTotalJsonBodyWithinBudget(
        estimateJsonBodyBytes({
          photoDataUrl: photo.dataUrl,
          sheetDataUrl: currentSheet.dataUrl,
          extraText: corrections.join("\n"),
        }),
      );
      const sheet = await ai.correctPhotoColoring({
        photoDataUrl: photo.dataUrl,
        sheetDataUrl: currentSheet.dataUrl,
        corrections,
        printPrefs,
      });
      return Response.json({ sheet });
    }

    return Response.json({ error: "Unknown mode." }, { status: 400 });
  } catch (error) {
    const raw =
      error instanceof Error ? error.message : "The crayons jammed on that photo.";
    const message = /invalid json response/i.test(raw)
      ? "The image model had a temporary hiccup. Please try generating again."
      : raw;
    console.error("[photo-coloring]", raw, error);
    return Response.json({ error: message }, { status: 500 });
  }
}
