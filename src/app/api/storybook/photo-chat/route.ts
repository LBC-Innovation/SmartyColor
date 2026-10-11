import { ensurePhotoDataUrlForRequest } from "@/lib/ai/compressPhotoServer";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { photoDataUrlById } from "@/server/libraryImages";
import {
  storybookPhotoChat,
  storybookStubPhotoChat,
} from "@/lib/ai/storybookGemini";
import type { StoryChatMessage } from "@/lib/v2/storybookTypes";

export const maxDuration = 60;

type Body = {
  albumTitle?: string;
  tripNarrative?: string;
  familyContext?: string;
  userCaption?: string;
  photoSummary?: string | null;
  history?: StoryChatMessage[];
  userMessage?: string;
  photoDataUrl?: string;
  /* Cloud library: read the photo from storage instead of the body. */
  photoId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const userMessage = body.userMessage?.trim();
    if (!userMessage) {
      return Response.json({ error: "Say something about this photo." }, { status: 400 });
    }

    const hasGeminiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
    if (provider === "stub" || !hasGeminiKey) {
      const stub = storybookStubPhotoChat({
        userMessage,
        photoSummary: body.photoSummary ?? null,
      });
      return Response.json(stub);
    }

    let photoDataUrl = body.photoDataUrl;
    if (body.photoId) {
      const auth = await requireAuthRequest(request);
      if ("error" in auth) return auth.error;
      const photo = await photoDataUrlById(auth.user.id, body.photoId);
      if (photo.error) return Response.json({ error: photo.error.message }, { status: 404 });
      photoDataUrl = photo.data!.dataUrl;
    }
    if (photoDataUrl) {
      const prepared = await ensurePhotoDataUrlForRequest(photoDataUrl, 1);
      photoDataUrl = prepared.dataUrl;
    }

    const result = await storybookPhotoChat({
      albumTitle: body.albumTitle ?? "",
      tripNarrative: body.tripNarrative ?? "",
      familyContext: body.familyContext ?? "",
      userCaption: body.userCaption ?? "",
      photoSummary: body.photoSummary ?? null,
      history: body.history ?? [],
      userMessage,
      photoDataUrl,
    });

    return Response.json({
      assistantMessage: result.assistantMessage,
      photoSummary: result.photoSummary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not chat about this photo.";
    return Response.json({ error: message }, { status: 500 });
  }
}
