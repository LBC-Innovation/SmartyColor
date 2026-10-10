import {
  storybookGenerateStory,
  storybookStubGenerate,
} from "@/lib/ai/storybookGemini";

export const maxDuration = 120;

type Body = {
  albumTitle?: string;
  tripNarrative?: string;
  familyContext?: string;
  photoIds?: string[];
  photos?: Array<{
    capturedAt: string;
    userCaption: string;
    photoSummary: string | null;
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const photoIds = body.photoIds ?? [];
    const photos = body.photos ?? [];

    if (photoIds.length === 0 || photos.length === 0) {
      return Response.json(
        { error: "Add at least one photo before generating the story." },
        { status: 400 },
      );
    }
    if (photoIds.length !== photos.length) {
      return Response.json({ error: "Photo list mismatch." }, { status: 400 });
    }
    if (!body.tripNarrative?.trim()) {
      return Response.json(
        { error: "Describe the trip so we can write the story." },
        { status: 400 },
      );
    }

    const hasGeminiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
    if (provider === "stub" || !hasGeminiKey) {
      const story = storybookStubGenerate({
        albumTitle: body.albumTitle ?? "",
        photoIds,
      });
      return Response.json({ story });
    }

    const story = await storybookGenerateStory({
      albumTitle: body.albumTitle ?? "",
      tripNarrative: body.tripNarrative ?? "",
      familyContext: body.familyContext ?? "",
      photoIds,
      photos,
    });

    return Response.json({ story });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate the story.";
    return Response.json({ error: message }, { status: 500 });
  }
}
