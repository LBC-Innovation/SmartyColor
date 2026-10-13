import {
  assertTotalJsonBodyWithinBudget,
  ensurePhotoDataUrlForRequest,
} from "@/lib/ai/compressPhotoServer";
import { createColoringAI } from "@/lib/ai/createProvider";
import { normalizeCorrections, parsePhotoDataUrl } from "@/lib/ai/photoDataUrl";
import { estimateJsonBodyBytes } from "@/lib/photo/payloadBudget";
import { defaultPrintPrefs, type PrintPrefs } from "@/lib/print/settings";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { photoDataUrlById, revisionDataUrlById } from "@/server/libraryImages";
import { withVisionUser } from "@/lib/visionCost/context";
import { addRevisionFromSheet, type RevisionMeta } from "@/server/libraryService";
import { quoted, recordActivity } from "@/server/activityService";
import {
  chargeSheetUsage,
  insufficientCreditsBody,
  quoteSheetUsage,
  refundSheetUsage,
} from "@/server/sheetUsageService";
import { INSUFFICIENT_CREDITS_CODE, type SheetUsageKind } from "@/lib/credits/pricing";
import {
  PHOTO_MAX_CORRECTIONS,
  PHOTO_MAX_CORRECTION_CHARS,
  type PhotoImageSizeHint,
} from "@/lib/session/photoTypes";

export const maxDuration = 120;

type Body =
  | {
      mode: "generate";
      photoDataUrl: string;
      printPrefs?: PrintPrefs;
      image?: PhotoImageSizeHint;
    }
  | {
      mode: "correct";
      photoDataUrl: string;
      sheetDataUrl: string;
      corrections: string[];
      printPrefs?: PrintPrefs;
      image?: PhotoImageSizeHint;
    }
  /* Cloud library (signed-in): bytes are read from storage and the result is stored as a revision. */
  /* sourceRevisionId: draw from a portrait version of the photo instead of the upload. */
  | { mode: "generate-library"; photoId: string; sourceRevisionId?: string }
  | { mode: "correct-library"; photoId: string; revisionId: string; corrections: string[] };

function mergePrintPrefs(raw?: PrintPrefs): PrintPrefs {
  if (!raw) return defaultPrintPrefs;
  return { ...defaultPrintPrefs, ...raw };
}

function imageSizeHint(raw: unknown): PhotoImageSizeHint | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { width, height } = raw as { width?: unknown; height?: unknown };
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  return undefined;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;

    if (body.mode === "generate-library" || body.mode === "correct-library") {
      return await handleLibraryMode(request, body);
    }
    const printPrefs = mergePrintPrefs(body.printPrefs);
    const image = imageSizeHint(body.image);
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
        image,
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
        image,
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

async function handleLibraryMode(
  request: Request,
  body: Extract<Body, { mode: "generate-library" | "correct-library" }>,
) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const userId = auth.user.id;
  if (typeof body.photoId !== "string" || !body.photoId) {
    return Response.json({ error: "photoId is required." }, { status: 400 });
  }

  return withVisionUser(userId, async () => handleLibraryModeForUser(userId, body));
}

async function handleLibraryModeForUser(
  userId: string,
  body: Extract<Body, { mode: "generate-library" | "correct-library" }>,
) {
  const kind: SheetUsageKind = body.mode === "generate-library" ? "generation" : "edit";
  let corrections: string[] = [];
  if (body.mode === "correct-library") {
    if (typeof body.revisionId !== "string" || !body.revisionId) {
      return Response.json({ error: "revisionId is required." }, { status: 400 });
    }
    corrections = normalizeCorrections(body.corrections ?? []);
    if (corrections.length === 0) {
      return Response.json({ error: "Add at least one correction." }, { status: 400 });
    }
  }

  const photo = await photoDataUrlById(userId, body.photoId);
  if (photo.error) {
    return Response.json({ error: photo.error.message }, { status: photo.error.code === "NOT_FOUND" ? 404 : 500 });
  }
  const { photo: record, dataUrl, printPrefs } = photo.data!;
  if (body.mode === "generate-library" && body.sourceRevisionId !== undefined && typeof body.sourceRevisionId !== "string") {
    return Response.json({ error: "sourceRevisionId must be a string." }, { status: 400 });
  }

  // Don't spend on the model for a wallet that can't cover it.
  const quote = await quoteSheetUsage(userId, kind, record.editCount);
  if (quote.error) return Response.json({ error: quote.error.message }, { status: 500 });
  if (!quote.data.affordable) {
    return Response.json(
      insufficientCreditsBody(kind, quote.data.costCents, quote.data.creditsBalanceCents),
      { status: 402 },
    );
  }

  const ai = createColoringAI();

  let current;
  if (body.mode === "correct-library") {
    current = await revisionDataUrlById(userId, body.revisionId);
    if (current.error) {
      return Response.json({ error: current.error.message }, { status: current.error.code === "NOT_FOUND" ? 404 : 500 });
    }
    if (current.data!.photoId !== record.id || current.data!.kind === "photo") {
      return Response.json({ error: "That version is not a coloring sheet of this photo." }, { status: 400 });
    }
  }

  // A sheet of a portrait version is drawn from, and checked against, that version.
  const sourceRevisionId =
    body.mode === "generate-library" ? body.sourceRevisionId : current!.data!.sourceRevisionId;
  let source: { dataUrl: string; printPrefs: PrintPrefs; image?: PhotoImageSizeHint };
  let meta: RevisionMeta | undefined;
  if (sourceRevisionId) {
    const version = await revisionDataUrlById(userId, sourceRevisionId);
    if (version.error) {
      return Response.json({ error: version.error.message }, { status: version.error.code === "NOT_FOUND" ? 404 : 500 });
    }
    if (version.data!.photoId !== record.id || version.data!.kind !== "photo") {
      return Response.json({ error: "That version is not a photo version of this photo." }, { status: 400 });
    }
    const orientation = version.data!.orientation === "landscape" ? "landscape" : "portrait";
    source = { dataUrl: version.data!.dataUrl, printPrefs: { ...printPrefs, orientation } };
    meta = { orientation, sourceRevisionId };
  } else {
    source = {
      dataUrl,
      printPrefs,
      image: record.width && record.height ? { width: record.width, height: record.height } : undefined,
    };
  }

  const sheet = current
    ? await ai.correctPhotoColoring({
        photoDataUrl: source.dataUrl,
        sheetDataUrl: current.data!.dataUrl,
        corrections,
        printPrefs: source.printPrefs,
        image: source.image,
      })
    : await ai.photoToColoring({
        photoDataUrl: source.dataUrl,
        printPrefs: source.printPrefs,
        image: source.image,
      });

  // Charge only once there is a sheet to hand over; refund if it can't be saved.
  const charge = await chargeSheetUsage(userId, record.id, kind);
  if (charge.error) {
    if (charge.error.code === INSUFFICIENT_CREDITS_CODE) {
      return Response.json(
        insufficientCreditsBody(kind, quote.data.costCents, quote.data.creditsBalanceCents),
        { status: 402 },
      );
    }
    return Response.json({ error: charge.error.message }, { status: 500 });
  }

  let stored;
  try {
    stored = await addRevisionFromSheet(userId, { id: record.id, projectId: record.projectId }, sheet, meta);
  } catch (error) {
    await refundSheetUsage(userId, record.id, kind, charge.data.chargedCents);
    throw error;
  }
  if (stored.error) {
    await refundSheetUsage(userId, record.id, kind, charge.data.chargedCents);
    return Response.json({ error: stored.error.message }, { status: 500 });
  }
  // Charged sheets reach the history through their ledger entry; free ones have none.
  if (charge.data.chargedCents === 0) {
    await recordActivity({
      userId,
      category: "sheets",
      type: kind === "edit" ? "sheet_edited" : "sheet_generated",
      description:
        kind === "edit"
          ? `Edited the coloring sheet for ${quoted(record.fileName, "a photo")} (free edit)`
          : `Generated a coloring sheet from ${quoted(record.fileName, "a photo")}`,
      referenceType: "library_photo",
      referenceId: record.id,
    });
  }
  return Response.json({
    photo: stored.data,
    chargedCents: charge.data.chargedCents,
    creditsBalanceCents: charge.data.creditsBalanceCents,
  });
}
