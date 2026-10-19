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
  /** "contributor" when someone else shared this album with the caller. */
  role: LibraryProjectRole;
  /** Display name of the album's owner (contributor rows only). */
  ownerName: string | null;
  /** How many people the caller has invited (owner rows only). */
  sharedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LibraryProjectRole = "owner" | "contributor";

/** One invite on an album, as its owner sees it. Deliberately says nothing about the invitee's account. */
export type AlbumShare = {
  id: string;
  email: string;
  invitedAt: string;
};

/** What the sign-up page shows for an invite link. */
export type AlbumInvitePreview = {
  albumId: string;
  albumName: string;
  inviterName: string;
  email: string;
};

export type LibraryRevision = {
  id: string;
  storagePath: string;
  mimeType: string;
  title: string;
  /** "photo" is an AI portrait version of the photo itself. */
  kind: "sheet" | "photo";
  /** Shape of this version when it differs from the uploaded photo. */
  orientation: string | null;
  /** The photo version a sheet was drawn from; null means the uploaded photo. */
  sourceRevisionId: string | null;
  createdAt: string;
  /** Short-lived read URL; refresh via /photos when it expires. */
  url: string;
  /** Short-lived URL for a small server-resized copy, for tiles. Absent if it couldn't be signed. */
  thumbUrl?: string;
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
  /** AI edits already applied to this photo's sheet; the first few are free. */
  editCount: number;
  revisions: LibraryRevision[];
  /** False for a contributor looking at someone else's photo. */
  canDelete: boolean;
  /** Short-lived read URL for the original. */
  url: string;
  /** Short-lived URL for a small server-resized copy of the original, for tiles. */
  thumbUrl?: string;
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

/** A live, unlisted link to one coloring page (never the photo or the album). */
export type PageShare = {
  /** Public URL, already tagged utm_source=share. */
  url: string;
  /** The sheet version the link shows. */
  revisionId: string;
  createdAt: string;
};

/** A photo uploaded this calendar year, offered when starting a "book of the year" album. */
export type YearPhoto = {
  id: string;
  projectId: string;
  projectName: string;
  hasSheet: boolean;
  createdAt: string;
  /** Short-lived URL for a small copy, for the picker tile. */
  thumbUrl: string | null;
};
