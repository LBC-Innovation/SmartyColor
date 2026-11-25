import {
  assertTotalJsonBodyWithinBudget,
  ensurePhotoDataUrlForRequest,
} from "@/lib/ai/compressPhotoServer";
import { createColoringAI } from "@/lib/ai/createProvider";
import { normalizeCorrections, parsePhotoDataUrl } from "@/lib/ai/photoDataUrl";
import { estimateJsonBodyBytes } from "@/lib/photo/payloadBudget";
import { defaultPrintPrefs, type PrintPrefs } from "@/lib/print/settings";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { toPublicErrorMessage } from "@/lib/security/publicError";
import { checkGuestUsage, guestLimitResponse } from "@/server/guestUsageGuard";
import { photoDataUrlById, revisionDataUrlById } from "@/server/libraryImages";
import { withVisionUser } from "@/lib/visionCost/context";
import { startRequestTimer, type RequestTimer } from "@/server/requestTiming";
import { addRevisionFromSheet, getAlbumDesignTheme, type RevisionMeta } from "@/server/libraryService";
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
  parseReframeTarget,
  type PhotoImageSizeHint,
  type ReframeTarget,
} from "@/lib/session/photoTypes";
import { withVisionRequest } from "@/server/visionAttribution";

export const maxDuration = 120;

const SERVER_FAULT_MESSAGE =
  "Something broke on our side while working on this page. It isn't your photo or your request, and trying again right away probably won't help. Try again later, or let us know if it keeps happening.";

type Body =
  | {
      mode: "generate";
      photoDataUrl: string;
      printPrefs?: PrintPrefs;
      image?: PhotoImageSizeHint;
      pageOrientation?: ReframeTarget;
    }
  | {
      mode: "correct";
      photoDataUrl: string;
      sheetDataUrl: string;
      corrections: string[];
      printPrefs?: PrintPrefs;
      image?: PhotoImageSizeHint;
      pageOrientation?: ReframeTarget;
    }
  /* Cloud library (signed-in): bytes are read from storage and the result is stored as a revision. */
  /* sourceRevisionId: draw from a portrait version of the photo instead of the upload. */
  /* pageOrientation: draw the upload straight onto a page of that shape (no reframed photo). */
  | { mode: "generate-library"; photoId: string; sourceRevisionId?: string; pageOrientation?: ReframeTarget }
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

/** AI costs from this request are recorded against the signed-in account, or the guest's address. */
export async function POST(request: Request) {
  return withVisionRequest(request, () => handlePost(request));
}

async function handlePost(request: Request) {
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
      // Guests are limited per day; checked before any work so refused requests cost nothing.
      const usage = await checkGuestUsage(request, "page");
      if (!usage.allowed) return guestLimitResponse(usage.scope, "page");
      // True once the paid model is about to be called. A failure after that point is not refunded
      // (blocked images and provider errors cost money), only failures before it are.
      let modelCalled = false;
      try {
        const photo = await ensurePhotoDataUrlForRequest(body.photoDataUrl, 1);
        assertTotalJsonBodyWithinBudget(
          estimateJsonBodyBytes({ photoDataUrl: photo.dataUrl }),
        );
        modelCalled = true;
        const sheet = await ai.photoToColoring({
          photoDataUrl: photo.dataUrl,
          printPrefs,
          image,
          pageOrientation: parseReframeTarget(body.pageOrientation),
        });
        return Response.json({ sheet });
      } catch (error) {
        // Preparing the photo failed before any paid call: the visitor keeps their free page.
        if (!modelCalled) await usage.refund();
        throw error;
      }
    }

    if (body.mode === "correct") {
      if (!body.photoDataUrl?.trim() || !body.sheetDataUrl?.trim()) {
        return Response.json(
          { error: "Need the photo and the current coloring page." },
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
      const usage = await checkGuestUsage(request, "edit");
      if (!usage.allowed) return guestLimitResponse(usage.scope, "edit");
      let modelCalled = false;
      try {
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
        modelCalled = true;
        const sheet = await ai.correctPhotoColoring({
          photoDataUrl: photo.dataUrl,
          sheetDataUrl: currentSheet.dataUrl,
          corrections,
          printPrefs,
          image,
          pageOrientation: parseReframeTarget(body.pageOrientation),
        });
        return Response.json({ sheet });
      } catch (error) {
        if (!modelCalled) await usage.refund();
        throw error;
      }
    }

    return Response.json({ error: "Unknown mode." }, { status: 400 });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    // Friendly cases stay; anything else goes through the public-error filter so provider
    // internals and keys never reach the browser. The full error is logged server-side.
    // The filter only falls back for our own bugs and provider account problems (quota,
    // billing, keys): both are on our side, so the message says a retry won't help.
    const message = /invalid json response/i.test(raw)
      ? "The image model had a temporary hiccup. Please try generating again."
      : toPublicErrorMessage(error, SERVER_FAULT_MESSAGE);
    console.error("[photo-coloring]", raw, error instanceof Error ? error.stack : error);
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

  const timer = startRequestTimer("photo-coloring", { mode: body.mode });
  try {
    const response = await withVisionUser(userId, async () => handleLibraryModeForUser(userId, body, timer));
    timer.done({ status: response.status });
    return response;
  } catch (error) {
    timer.done({ status: "error" });
    throw error;
  }
}

async function handleLibraryModeForUser(
  userId: string,
  body: Extract<Body, { mode: "generate-library" | "correct-library" }>,
  timer: RequestTimer,
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
  timer.mark("loadPhoto");
  if (photo.error) {
    return Response.json({ error: photo.error.message }, { status: photo.error.code === "NOT_FOUND" ? 404 : 500 });
  }
  const { photo: record, dataUrl, printPrefs } = photo.data!;
  if (body.mode === "generate-library" && body.sourceRevisionId !== undefined && typeof body.sourceRevisionId !== "string") {
    return Response.json({ error: "sourceRevisionId must be a string." }, { status: 400 });
  }

  // Don't spend on the model for a wallet that can't cover it.
  const quote = await quoteSheetUsage(userId, kind, record.editCount, record.id);
  timer.mark("quote");
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
    timer.mark("loadSheet");
    if (current.error) {
      return Response.json({ error: current.error.message }, { status: current.error.code === "NOT_FOUND" ? 404 : 500 });
    }
    if (current.data!.photoId !== record.id || current.data!.kind === "photo") {
      return Response.json({ error: "That version is not a coloring page of this photo." }, { status: 400 });
    }
  }

  // A sheet of a portrait version is drawn from, and checked against, that version.
  const sourceRevisionId =
    body.mode === "generate-library" ? body.sourceRevisionId : current!.data!.sourceRevisionId;
  let source: { dataUrl: string; printPrefs: PrintPrefs; image?: PhotoImageSizeHint };
  let meta: RevisionMeta | undefined;
  // A page drawn straight from the upload in the other shape: drawn, edited and stored in that shape.
  const pageOrientation =
    body.mode === "generate-library"
      ? parseReframeTarget(body.pageOrientation)
      : parseReframeTarget(current!.data!.orientation);
  if (body.mode === "generate-library" && body.pageOrientation !== undefined && !pageOrientation) {
    return Response.json({ error: "pageOrientation must be portrait or landscape." }, { status: 400 });
  }
  if (sourceRevisionId) {
    const version = await revisionDataUrlById(userId, sourceRevisionId);
    timer.mark("loadSourceVersion");
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
    if (pageOrientation) meta = { orientation: pageOrientation };
  }
  // A reframed photo already has its page's shape; only a page of the upload is turned.
  const sheetOrientation = sourceRevisionId ? undefined : pageOrientation;

  // The album's design theme is read here from the database, never from the request: it shapes a
  // new page (including a remake of one), and never an edit of an existing page.
  const designTheme = current ? null : await getAlbumDesignTheme(record.projectId);

  const sheet = current
    ? await ai.correctPhotoColoring({
        photoDataUrl: source.dataUrl,
        sheetDataUrl: current.data!.dataUrl,
        corrections,
        printPrefs: source.printPrefs,
        image: source.image,
        pageOrientation: sheetOrientation,
      })
    : await ai.photoToColoring({
        photoDataUrl: source.dataUrl,
        printPrefs: source.printPrefs,
        image: source.image,
        pageOrientation: sheetOrientation,
        designTheme,
      });

  timer.mark("model");

  // Charge only once there is a sheet to hand over; refund if it can't be saved.
  // Parallel requests can each pass the pre-check above and then find the wallet short here. The
  // model has already run by then, so the page is kept and handed over uncharged rather than
  // thrown away; the client caps how many pages it starts at once, so this stays rare.
  const charge = await chargeSheetUsage(userId, record.id, kind);
  timer.mark("charge");
  let chargedCents = 0;
  let purchaseCodeId: string | null = null;
  let creditsBalanceCents = quote.data.creditsBalanceCents;
  if (charge.error) {
    if (charge.error.code !== INSUFFICIENT_CREDITS_CODE) {
      return Response.json({ error: charge.error.message }, { status: 500 });
    }
    const latest = await quoteSheetUsage(userId, kind, record.editCount, record.id);
    if (!latest.error) creditsBalanceCents = latest.data.creditsBalanceCents;
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "photo-coloring: charge failed after the model ran; page returned uncharged",
        userId,
        photoId: record.id,
        kind,
        costCents: quote.data.costCents,
        creditsBalanceCents,
      }),
    );
  } else {
    chargedCents = charge.data.chargedCents;
    purchaseCodeId = charge.data.purchaseCodeId;
    creditsBalanceCents = charge.data.creditsBalanceCents;
  }
  const charged = !charge.error;

  let stored;
  try {
    stored = await addRevisionFromSheet(userId, { id: record.id, projectId: record.projectId }, sheet, meta);
    timer.mark("store");
  } catch (error) {
    if (charged) await refundSheetUsage(userId, record.id, kind, chargedCents, purchaseCodeId);
    throw error;
  }
  if (stored.error) {
    if (charged) await refundSheetUsage(userId, record.id, kind, chargedCents, purchaseCodeId);
    return Response.json({ error: stored.error.message }, { status: 500 });
  }
  // Charged sheets reach the history through their ledger entry; free ones have none.
  if (charged && chargedCents === 0) {
    const how = purchaseCodeId ? "included with your code" : "free edit";
    await recordActivity({
      userId,
      category: "sheets",
      type: kind === "edit" ? "sheet_edited" : "sheet_generated",
      description:
        kind === "edit"
          ? `Edited the coloring page for ${quoted(record.fileName, "a photo")} (${how})`
          : `Generated a coloring page from ${quoted(record.fileName, "a photo")}${purchaseCodeId ? " (included with your code)" : ""}`,
      referenceType: "library_photo",
      referenceId: record.id,
    });
  }
  return Response.json({
    photo: stored.data,
    chargedCents,
    creditsBalanceCents,
    coveredByCode: Boolean(purchaseCodeId),
  });
}
