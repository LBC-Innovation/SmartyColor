import type { PrintPrefs } from "@/lib/print/settings";
import type { GeneratedSheet, SheetVersion } from "@/lib/session/types";
import type { StudioLayoutMode } from "@/components/v2/V2StudioLayoutToggle";
import {
  defaultStoryFields,
  type PhotoCropRect,
  type StoryChatMessage,
  type StoryPrintArtMode,
  type V2GeneratedStory,
  type V2StoryBookPhase,
} from "@/lib/v2/storybookTypes";

export type V2PhotoEntry = {
  id: string;
  previewUrl: string;
  photoDataUrl: string;
  printPrefs: PrintPrefs;
  sheet: GeneratedSheet | null;
  sheetRevisions?: SheetVersion[];
  activeRevisionId?: string | null;
  generating: boolean;
  correcting?: boolean;
  /** ISO timestamp for story timeline ordering */
  capturedAt?: string;
  fileName?: string;
  userCaption?: string;
  chatMessages?: StoryChatMessage[];
  photoSummary?: string | null;
  crop?: PhotoCropRect | null;
};

export type V2StudioSnapshot = {
  photos: V2PhotoEntry[];
  selectedId: string | null;
  studioLayout: StudioLayoutMode;
  tripNarrative: string;
  familyContext: string;
  generatedStory: V2GeneratedStory | null;
  printArtMode: StoryPrintArtMode;
  storyPhase: V2StoryBookPhase;
};

export function emptyV2StudioSnapshot(): V2StudioSnapshot {
  return {
    photos: [],
    selectedId: null,
    studioLayout: "both",
    ...defaultStoryFields(),
  };
}

export type V2ProjectMeta = {
  id: string;
  name: string;
  updatedAt: string;
  photoCount: number;
};

export type V2ProjectsMeta = {
  activeProjectId: string;
  projects: V2ProjectMeta[];
};

export type V2StudioBootstrap = {
  meta: V2ProjectsMeta;
  session: V2StudioSnapshot;
};

export function normalizeV2SheetRevisions(photo: V2PhotoEntry): SheetVersion[] {
  if (photo.sheetRevisions && photo.sheetRevisions.length > 0) {
    return photo.sheetRevisions;
  }
  if (photo.sheet) {
    return [
      {
        id: `${photo.id}-rev-1`,
        createdAt: "",
        sheet: photo.sheet,
      },
    ];
  }
  return [];
}
