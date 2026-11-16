import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { copyObject, libraryPaths } from "@/server/storage/libraryFiles";

/**
 * Copy a photo, every version of it and its coloring pages into another album. Copies are made
 * inside storage, so nothing has to be uploaded or drawn again; the original stays where it is.
 */

type Row = Record<string, unknown>;

export type PhotoCopyTarget = {
  projectId: string;
  /** The album's owner: copies live under their storage prefix and count as their photos. */
  ownerId: string;
  position: number;
  /** Who added the copy. Leave unset to keep the original uploader. */
  uploadedBy?: string;
  /** Keep the original's created_at (so a copy still counts in the year it was uploaded). */
  keepCreatedAt?: boolean;
};

/** The photo's versions, oldest first, keyed by photo id. */
export async function revisionsByPhoto(photoIds: string[]): Promise<Map<string, Row[]>> {
  const byPhoto = new Map<string, Row[]>();
  if (photoIds.length === 0) return byPhoto;
  const { data, error } = await getSupabaseAdmin()
    .from("library_sheet_revisions")
    .select("*")
    .in("photo_id", photoIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const list = byPhoto.get(r.photo_id as string) ?? [];
    list.push(r);
    byPhoto.set(r.photo_id as string, list);
  }
  return byPhoto;
}

/** Returns the new photo's id. Throws when a file or row can't be copied. */
export async function copyPhoto(photo: Row, revisions: Row[], target: PhotoCopyTarget): Promise<string> {
  const db = getSupabaseAdmin();
  const { projectId, ownerId } = target;
  const newPhotoId = crypto.randomUUID();
  const originalPath = libraryPaths.original(ownerId, projectId, newPhotoId, photo.mime_type as string);
  await copyObject(photo.storage_path as string, originalPath);

  const revIds = new Map(revisions.map((r) => [r.id as string, crypto.randomUUID()]));
  const revCopies = await Promise.all(
    revisions.map(async (r) => {
      const newId = revIds.get(r.id as string)!;
      const path = libraryPaths.sheet(ownerId, projectId, newPhotoId, newId, r.mime_type as string);
      await copyObject(r.storage_path as string, path);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, photo_id, user_id, storage_path, source_revision_id, ...rest } = r;
      return {
        ...rest,
        id: newId,
        photo_id: newPhotoId,
        user_id: ownerId,
        storage_path: path,
        source_revision_id: source_revision_id ? revIds.get(source_revision_id as string) ?? null : null,
      };
    }),
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, project_id, user_id, storage_path, active_revision_id, created_at, updated_at, ...rest } = photo;
  const { error } = await db.from("library_photos").insert({
    ...rest,
    id: newPhotoId,
    project_id: projectId,
    user_id: ownerId,
    storage_path: originalPath,
    position: target.position,
    ...(target.uploadedBy ? { uploaded_by: target.uploadedBy } : {}),
    ...(target.keepCreatedAt ? { created_at } : {}),
  });
  if (error) throw new Error(error.message);

  if (revCopies.length > 0) {
    const { error: revError } = await db.from("library_sheet_revisions").insert(revCopies);
    if (revError) throw new Error(revError.message);
  }
  const activeId = active_revision_id ? revIds.get(active_revision_id as string) : undefined;
  if (activeId) {
    const { error: activeError } = await db
      .from("library_photos")
      .update({ active_revision_id: activeId })
      .eq("id", newPhotoId);
    if (activeError) throw new Error(activeError.message);
  }
  return newPhotoId;
}
