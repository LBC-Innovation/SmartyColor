import * as api from "@/lib/api/client";
import type { ApiResult } from "@/lib/api/types";
import type {
  AlbumInvitePreview,
  AlbumShare,
  LibraryPhoto,
  LibraryPhotoPatch,
  LibraryProject,
  LibraryProjectPatch,
  LibraryRevision,
  PageShare,
  RegisterPhotoInput,
  SignedUpload,
  YearPhoto,
} from "@/lib/library/types";

/** Browser-side calls for the cloud library. Bytes go straight to storage, never through /api. */

const base = "/library";

export function listProjects() {
  return api.request<LibraryProject[]>(`${base}/projects`);
}

export function createProject(name: string) {
  return api.request<LibraryProject>(`${base}/projects`, { method: "POST", body: JSON.stringify({ name }) });
}

export function updateProject(id: string, patch: LibraryProjectPatch) {
  return api.request<LibraryProject>(`${base}/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteProject(id: string) {
  return api.request<{ id: string }>(`${base}/projects/${id}`, { method: "DELETE" });
}

export function listPhotos(projectId: string) {
  return api.request<LibraryPhoto[]>(`${base}/projects/${projectId}/photos`);
}

export function createPhotoUpload(projectId: string, mimeType: string) {
  return api.request<SignedUpload & { photoId: string }>(`${base}/projects/${projectId}/upload-url`, {
    method: "POST",
    body: JSON.stringify({ mimeType }),
  });
}

export function registerPhoto(projectId: string, input: RegisterPhotoInput) {
  return api.request<LibraryPhoto>(`${base}/projects/${projectId}/photos`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function reorderPhotos(projectId: string, orderedIds: string[]) {
  return api.request<{ ok: true }>(`${base}/projects/${projectId}/photos`, {
    method: "PATCH",
    body: JSON.stringify({ orderedIds }),
  });
}

export function getPhoto(id: string) {
  return api.request<LibraryPhoto>(`${base}/photos/${id}`);
}

export function updatePhoto(id: string, patch: LibraryPhotoPatch) {
  return api.request<LibraryPhoto>(`${base}/photos/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Flip a photo and its coloring sheets left-to-right. */
export function mirrorPhoto(id: string) {
  return api.request<LibraryPhoto>(`${base}/photos/${id}/mirror`, { method: "POST" });
}

export function deletePhotos(ids: string[]) {
  return api.request<{ deleted: string[] }>(`${base}/photos/delete`, { method: "POST", body: JSON.stringify({ ids }) });
}

export function createRevisionUpload(photoId: string, mimeType: string) {
  return api.request<SignedUpload & { revisionId: string }>(`${base}/photos/${photoId}/upload-url`, {
    method: "POST",
    body: JSON.stringify({ mimeType }),
  });
}

export function registerRevision(
  photoId: string,
  input: {
    revisionId: string;
    mimeType: string;
    title: string;
    makeActive: boolean;
    kind?: LibraryRevision["kind"];
    orientation?: string | null;
    sourceRevisionId?: string | null;
  },
) {
  return api.request<LibraryPhoto>(`${base}/photos/${photoId}/revisions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PUT bytes to a signed upload URL. Returns an ApiResult so callers handle it like any call. */
export async function putToSignedUrl(
  upload: Pick<SignedUpload, "url">,
  blob: Blob,
  mimeType: string,
): Promise<ApiResult<{ ok: true }>> {
  try {
    const res = await fetch(upload.url, {
      method: "PUT",
      headers: { "Content-Type": mimeType, "x-upsert": "true" },
      body: blob,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { data: null, error: { message: `Upload failed (${res.status})${text ? `: ${text.slice(0, 120)}` : ""}` } };
    }
    return { data: { ok: true }, error: null };
  } catch {
    return { data: null, error: { message: "Network error during upload", code: "UNAVAILABLE" } };
  }
}

// ------------------------------------------------------------------ sharing

export function listShares(projectId: string) {
  return api.request<AlbumShare[]>(`${base}/projects/${projectId}/shares`);
}

export function inviteToAlbum(projectId: string, email: string) {
  return api.request<{ share: AlbumShare; emailSent: boolean }>(`${base}/projects/${projectId}/shares`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resendShare(projectId: string, shareId: string) {
  return api.request<{ emailSent: boolean }>(`${base}/projects/${projectId}/shares/${shareId}/resend`, {
    method: "POST",
  });
}

export function removeShare(projectId: string, shareId: string) {
  return api.request<{ id: string }>(`${base}/projects/${projectId}/shares/${shareId}`, { method: "DELETE" });
}

/** Stop contributing to an album someone else shared. */
export function leaveAlbum(projectId: string) {
  return removeShare(projectId, "me");
}

export function getInvitePreview(inviteId: string) {
  return api.request<AlbumInvitePreview>(`${base}/invites/${inviteId}`);
}

// ------------------------------------------------------------------ page links

/** The live share link for a page, or null when the page isn't shared. */
export function getPageShare(photoId: string) {
  return api.request<PageShare | null>(`${base}/photos/${photoId}/share`);
}

/** Share a page (or point its live link at another version of the sheet). */
export function sharePage(photoId: string, revisionId: string) {
  return api.request<PageShare>(`${base}/photos/${photoId}/share`, {
    method: "POST",
    body: JSON.stringify({ revisionId }),
  });
}

export function stopSharingPage(photoId: string) {
  return api.request<{ revoked: boolean }>(`${base}/photos/${photoId}/share`, { method: "DELETE" });
}

/** Email a printable PDF of an album's coloring pages to someone (signed-in only). */
export function sendAlbumToFamily(projectId: string, email: string, note: string) {
  return api.request<{ pageCount: number }>(`${base}/projects/${projectId}/send`, {
    method: "POST",
    body: JSON.stringify({ email, note }),
  });
}

// ------------------------------------------------------------------ book of the year

/** Photos in the caller's own albums uploaded since 1 January of `year`. */
export function listYearPhotos(year: number) {
  return api.request<YearPhoto[]>(`${base}/photos/year/${year}`);
}

/** A new album holding copies of these photos and their coloring pages. */
export function createProjectFromPhotos(name: string, photoIds: string[]) {
  return api.request<LibraryProject>(`${base}/projects/from-photos`, {
    method: "POST",
    body: JSON.stringify({ name, photoIds }),
  });
}
