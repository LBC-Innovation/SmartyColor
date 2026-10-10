export type StoryChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

/** Normalized crop region (0–1) relative to the source image. */
export type PhotoCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StoryPrintArtMode = "photos" | "coloring" | "blended";

export type V2StoryPage = {
  photoId: string;
  text: string;
};

export type V2GeneratedStory = {
  title: string;
  introduction: string;
  pages: V2StoryPage[];
  closing: string;
  generatedAt: string;
};

export type V2StoryBookPhase = "setup" | "photos" | "story" | "review";

export function defaultStoryFields() {
  return {
    tripNarrative: "",
    familyContext: "",
    generatedStory: null as V2GeneratedStory | null,
    printArtMode: "photos" as StoryPrintArtMode,
    storyPhase: "setup" as V2StoryBookPhase,
  };
}

export function sortPhotosByCapturedAt<
  T extends { id: string; capturedAt?: string },
>(photos: T[]): T[] {
  return [...photos].sort((a, b) => {
    const ta = Date.parse(a.capturedAt ?? "") || 0;
    const tb = Date.parse(b.capturedAt ?? "") || 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

export function photoStoryNotesComplete(photo: {
  userCaption?: string;
  photoSummary?: string | null;
  chatMessages?: StoryChatMessage[];
}): boolean {
  return Boolean(
    photo.userCaption?.trim() ||
      photo.photoSummary?.trim() ||
      (photo.chatMessages && photo.chatMessages.length > 0),
  );
}
