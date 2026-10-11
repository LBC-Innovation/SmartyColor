import type { PrintPrefs } from "@/lib/print/settings";
import type { PhotoCropRect, StoryChatMessage } from "@/lib/v2/storybookTypes";

/** Wire shapes for the cloud library (signed-in users). Image bytes are never inline. */

export type LibraryProject = {
  id: string;
  name: string;
  photoCount: number;
  selectedPhotoId: string | null;
  studioLayout: string;
  tripNarrative: string;
  familyContext: string;
  generatedStory: unknown | null;
  printArtMode: string | null;
  storyPhase: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LibraryRevision = {
  id: string;
  storagePath: string;
  mimeType: string;
  title: string;
  createdAt: string;
  /** Short-lived read URL; refresh via /photos when it expires. */
  url: string;
};

export type LibraryPhoto = {
  id: string;
  projectId: string;
  position: number;
  storagePath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  orientation: string | null;
  aspectRatio: string | null;
  fileName: string | null;
  capturedAt: string | null;
  printPrefs: PrintPrefs;
  userCaption: string;
  chatMessages: StoryChatMessage[];
  photoSummary: string | null;
  crop: PhotoCropRect | null;
  activeRevisionId: string | null;
  revisions: LibraryRevision[];
  /** Short-lived read URL for the original. */
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type LibraryPhotoPatch = Partial<{
  printPrefs: PrintPrefs;
  userCaption: string;
  chatMessages: StoryChatMessage[];
  photoSummary: string | null;
  crop: PhotoCropRect | null;
  activeRevisionId: string | null;
}>;

export type LibraryProjectPatch = Partial<{
  name: string;
  selectedPhotoId: string | null;
  studioLayout: string;
  tripNarrative: string;
  familyContext: string;
  generatedStory: unknown | null;
  printArtMode: string | null;
  storyPhase: string | null;
}>;

/** What the client sends after it has PUT the original to the signed upload URL. */
export type RegisterPhotoInput = {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  orientation: string;
  aspectRatio: string;
  fileName?: string | null;
  capturedAt?: string | null;
  printPrefs: PrintPrefs;
  position?: number;
};

export type SignedUpload = { path: string; url: string; token: string };

/** How long read URLs stay valid; the client caches bytes so this can be short. */
export const LIBRARY_READ_URL_TTL_SECONDS = 60 * 60;
