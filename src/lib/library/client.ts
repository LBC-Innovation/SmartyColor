import * as api from "@/lib/api/client";
import type { ApiResult } from "@/lib/api/types";
import type {
  LibraryPhoto,
  LibraryPhotoPatch,
  LibraryProject,
  LibraryProjectPatch,
  RegisterPhotoInput,
  SignedUpload,
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
  input: { revisionId: string; mimeType: string; title: string; makeActive: boolean },
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
