import "server-only";
import type { ApiResult } from "@/lib/api/types";
import type { PrintPrefs } from "@/lib/print/settings";
import type { LibraryPhoto } from "@/lib/library/types";
import { loadPhotoBytes, loadRevisionBytes } from "@/server/libraryService";

/** Bridges storage objects to the data-URL shaped inputs the AI/PDF code already takes. */

export function bytesToDataUrl(bytes: Buffer | Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function photoDataUrlById(
  userId: string,
  photoId: string,
): Promise<ApiResult<{ photo: LibraryPhoto; dataUrl: string; printPrefs: PrintPrefs }>> {
  const loaded = await loadPhotoBytes(userId, photoId);
  if (loaded.error) return loaded;
  const { photo, bytes, mime } = loaded.data!;
  return { data: { photo, dataUrl: bytesToDataUrl(bytes, mime), printPrefs: photo.printPrefs }, error: null };
}

export async function revisionDataUrlById(
  userId: string,
  revisionId: string,
): Promise<
  ApiResult<
    { dataUrl: string } & Omit<NonNullable<Awaited<ReturnType<typeof loadRevisionBytes>>["data"]>, "bytes" | "mime">
  >
> {
  const loaded = await loadRevisionBytes(userId, revisionId);
  if (loaded.error) return loaded;
  const { bytes, mime, ...rest } = loaded.data!;
  return { data: { dataUrl: bytesToDataUrl(bytes, mime), ...rest }, error: null };
}
