import type { StoryChatMessage } from "@/lib/v2/storybookTypes";

export const STORYBOOK_PHOTO_CHAT_SYSTEM = `You help families turn vacation photos into a children's storybook.
You speak warmly to parents and caregivers. Keep replies concise (2–4 short sentences).
Consider the overall trip narrative first, then how this specific photo fits the story arc.
Ask one helpful follow-up question when details would make the story richer for kids ages 4–10.
Never invent people or events that contradict what the user said.`;

export function buildStoryPhotoChatPrompt(input: {
  albumTitle: string;
  tripNarrative: string;
  familyContext: string;
  userCaption: string;
  photoSummary: string | null;
  history: StoryChatMessage[];
  userMessage: string;
}) {
  const historyBlock =
    input.history.length > 0
      ? input.history
          .map((m) => `${m.role === "user" ? "Parent" : "Helper"}: ${m.text}`)
          .join("\n")
      : "(no prior chat for this photo)";

  return `Album title: ${input.albumTitle || "Untitled trip"}

Trip narrative (whole album):
${input.tripNarrative || "(not provided yet)"}

Family context:
${input.familyContext || "(not provided)"}

Parent's short caption for this photo:
${input.userCaption || "(none)"}

Working summary of this photo in the story:
${input.photoSummary || "(not written yet)"}

Chat so far for this photo:
${historyBlock}

Parent's new message:
${input.userMessage}

Reply as the helper. If you can, end with an updated one-sentence "photoSummary" line prefixed exactly with PHOTO_SUMMARY:`;
}

export const STORYBOOK_GENERATE_SYSTEM = `You write gentle, read-aloud storybooks for children ages 4–10.
Use simple vocabulary, short paragraphs, and a warm tone. Sequence pages in chronological trip order.
Each page pairs with one vacation photo. Do not mention "the photo" — describe the moment as story art.
Stay faithful to facts the parent provided.`;

export function buildStoryGeneratePrompt(input: {
  albumTitle: string;
  tripNarrative: string;
  familyContext: string;
  photos: Array<{
    index: number;
    capturedAt: string;
    userCaption: string;
    photoSummary: string | null;
  }>;
}) {
  const photoLines = input.photos
    .map(
      (p) =>
        `Page ${p.index + 1} (photo id index ${p.index}, taken ${p.capturedAt}): caption="${p.userCaption || ""}" summary="${p.photoSummary || ""}"`,
    )
    .join("\n");

  return `Create a complete children's storybook for this family trip.

Album title: ${input.albumTitle || "Our adventure"}

Trip narrative:
${input.tripNarrative}

Family context:
${input.familyContext || "(none)"}

Photos in order (each becomes one illustrated page):
${photoLines}

Return JSON with:
- title: string (book title)
- introduction: string (1–3 sentences before page 1)
- pages: array of { photoIndex: number (0-based), text: string (2–5 sentences for kids) }
- closing: string (1–2 sentences)

Every photo index must appear exactly once in pages, in the same order as listed.`;
}
