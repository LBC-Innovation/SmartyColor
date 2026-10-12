import type { Orientation, PrintPrefs } from "@/lib/print/settings";
import type { PhotoLayout } from "@/lib/photo/orientation";
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

/** Facts about the uploaded image, measured once at ingest. Immutable, unlike printPrefs. */
export type V2PhotoImageMeta = {
  width: number;
  height: number;
  orientation: Orientation;
  aspectRatio: PhotoLayout["aspectRatio"];
};

export function photoImageMeta(layout: PhotoLayout): V2PhotoImageMeta {
  return {
    width: layout.width,
    height: layout.height,
    orientation: layout.orientation,
    aspectRatio: layout.aspectRatio,
  };
}

/** Orientation of the photo itself; image meta wins, older entries fall back to printPrefs. */
export function photoOrientation(photo: {
  image?: V2PhotoImageMeta;
  printPrefs: Pick<PrintPrefs, "orientation">;
}): Orientation {
  return photo.image?.orientation ?? photo.printPrefs.orientation;
}

/** printPrefs for API calls, with orientation taken from the measured image. */
export function photoPrintPrefs(photo: { image?: V2PhotoImageMeta; printPrefs: PrintPrefs }): PrintPrefs {
  return { ...photo.printPrefs, orientation: photoOrientation(photo) };
}

/** Where a cover-cropped thumbnail should anchor: faces sit high in portraits. */
export function photoThumbObjectPosition(photo: {
  image?: V2PhotoImageMeta;
  printPrefs?: Pick<PrintPrefs, "orientation">;
}): "top" | "center" {
  const orientation = photo.image?.orientation ?? photo.printPrefs?.orientation;
  return orientation === "portrait" ? "top" : "center";
}

/** Where a photo lives when the user is signed in. Absent for guest (local-only) entries. */
export type V2RemotePhoto = {
  photoId: string;
  projectId: string;
  storagePath: string;
};

export type V2PhotoEntry = {
  id: string;
  previewUrl: string;
  /**
   * Base64 data URL of the original — guests only. Cloud entries keep this
   * empty and are addressed by `remote.photoId`; their bytes live in the
   * image cache behind `previewUrl`.
   */
  photoDataUrl: string;
  remote?: V2RemotePhoto;
  /** False for a photo someone else added to an album shared with this user. */
  canDelete?: boolean;
  /** Set for every photo added since image metadata was introduced; older entries fall back to printPrefs. */
  image?: V2PhotoImageMeta;
  printPrefs: PrintPrefs;
  sheet: GeneratedSheet | null;
  sheetRevisions?: SheetVersion[];
  activeRevisionId?: string | null;
  /** Cloud entries: AI edits already applied to this sheet (the first few are free). */
  editCount?: number;
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
  /** Cloud albums only: "contributor" when someone else shared it with this user. */
  role?: "owner" | "contributor";
  /** Who shared the album (contributor rows). */
  ownerName?: string | null;
  /** How many people this user has invited to the album (owner rows). */
  sharedCount?: number;
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
