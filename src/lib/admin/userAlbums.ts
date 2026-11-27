/** A customer's albums for the admin customer drawer, with enough detail to debug one. */

export type AdminAlbumPhoto = {
  id: string;
  position: number;
  fileName: string | null;
  orientation: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  /** Someone other than the album owner added it (a shared album). */
  uploadedByOther: boolean;
  /** Coloring page versions made from this photo. */
  sheetCount: number;
  /** Other saved versions, such as portrait crops. */
  otherVersionCount: number;
  editCount: number;
  /** The version shown in the album; null means the original photo is shown. */
  activeVersionKind: string | null;
};

export type AdminAlbum = {
  id: string;
  name: string;
  /** "owner" for their own albums, "member" for one shared with them. */
  role: "owner" | "member";
  shareStatus: string | null;
  createdAt: string;
  updatedAt: string;
  designTheme: string | null;
  storyPhase: string | null;
  hasStory: boolean;
  /** People invited to this album, any status. */
  shareCount: number;
  bookOrderCount: number;
  photos: AdminAlbumPhoto[];
};

export type AdminUserAlbums = {
  albums: AdminAlbum[];
};
