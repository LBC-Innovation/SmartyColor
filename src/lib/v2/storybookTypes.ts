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

/** The same region after the image is flipped left-to-right. */
export function mirrorPhotoCrop(crop: PhotoCropRect): PhotoCropRect {
  return { ...crop, x: Math.min(1, Math.max(0, 1 - crop.x - crop.width)) };
}

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

/**
 * Persisted step of the story flow. "review" is a legacy value from when the
 * reader had its own tab; it now opens the Story tab, see storyTabFromPhase.
 */
export type V2StoryBookPhase = "setup" | "photos" | "story" | "review";

/** The three tabs of the story pane: trip setup, notes on one photo, the story itself. */
export type V2StoryBookTab = "setup" | "photos" | "story";

export function storyTabFromPhase(phase: V2StoryBookPhase): V2StoryBookTab {
  return phase === "review" ? "story" : phase;
}

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
