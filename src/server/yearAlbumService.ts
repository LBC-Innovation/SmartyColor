import "server-only";
import type { ApiResult } from "@/lib/api/types";
import type { LibraryProject, YearPhoto } from "@/lib/library/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { createProject } from "@/server/libraryService";
import { copyObject, libraryPaths, signedReadUrls } from "@/server/storage/libraryFiles";

/**
 * "Make a book of this year": list the photos in the caller's own albums uploaded this calendar
 * year, then start a new album holding copies of the ones they keep (with their coloring pages,
 * so nothing has to be generated again). Copies are made inside storage; the originals stay put.
 */

type Row = Record<string, unknown>;
const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });

export const MAX_YEAR_ALBUM_PHOTOS = 200;
const COPY_CONCURRENCY = 4;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function db() {
  return getSupabaseAdmin();
}

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

/** A photo copied into an earlier year album is the same photo; show it once. */
function sameUploadKey(row: Row): string {
  const name = row.file_name as string | null;
  if (!name) return row.id as string;
  return `${name}|${row.captured_at ?? ""}|${row.width ?? ""}x${row.height ?? ""}`;
}

export async function listYearPhotos(userId: string, year: number): Promise<ApiResult<YearPhoto[]>> {
  if (!Number.isInteger(year) || year < 2000 || year > 3000) return err("Invalid year", "INVALID");
  const { data: projects, error: pErr } = await db()
    .from("library_projects")
    .select("id, name")
    .eq("user_id", userId);
  if (pErr) return err(pErr.message);
  if (!projects?.length) return { data: [], error: null };
  const names = new Map(projects.map((p) => [p.id as string, (p.name as string) ?? ""]));

  const { data: rows, error } = await db()
    .from("library_photos")
    .select("id, project_id, storage_path, file_name, captured_at, width, height, active_revision_id, created_at")
    .in("project_id", [...names.keys()])
    .gte("created_at", `${year}-01-01T00:00:00Z`)
    .lt("created_at", `${year + 1}-01-01T00:00:00Z`)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) return err(error.message);

  const seen = new Set<string>();
  const unique = (rows ?? []).filter((r) => {
    const key = sameUploadKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return { data: [], error: null };

  const { data: sheets, error: sErr } = await db()
    .from("library_sheet_revisions")
    .select("photo_id, kind")
    .in(
      "photo_id",
      unique.map((r) => r.id as string),
    );
  if (sErr) return err(sErr.message);
  const withSheet = new Set((sheets ?? []).filter((s) => s.kind !== "photo").map((s) => s.photo_id as string));

  const paths = unique.map((r) => r.storage_path as string);
  const [thumbs, originals] = await Promise.all([
    signedReadUrls(paths.map(libraryPaths.thumb)).catch(() => new Map<string, string>()),
    signedReadUrls(paths).catch(() => new Map<string, string>()),
  ]);

  return {
    data: unique.map((r) => {
      const path = r.storage_path as string;
      return {
        id: r.id as string,
        projectId: r.project_id as string,
        projectName: names.get(r.project_id as string) ?? "",
        hasSheet: withSheet.has(r.id as string),
        createdAt: r.created_at as string,
        thumbUrl: thumbs.get(libraryPaths.thumb(path)) ?? originals.get(path) ?? null,
      };
    }),
    error: null,
  };
}

/** Run `fn` over items, at most `limit` at a time. */
async function forEachLimited<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Copy one photo, every version of it and its coloring pages into the new album. */
async function copyPhoto(userId: string, projectId: string, photo: Row, revisions: Row[], position: number) {
  const newPhotoId = crypto.randomUUID();
  const mime = photo.mime_type as string;
  const originalPath = libraryPaths.original(userId, projectId, newPhotoId, mime);
  await copyObject(photo.storage_path as string, originalPath);

  const revIds = new Map(revisions.map((r) => [r.id as string, crypto.randomUUID()]));
  const revCopies = await Promise.all(
    revisions.map(async (r) => {
      const newId = revIds.get(r.id as string)!;
      const path = libraryPaths.sheet(userId, projectId, newPhotoId, newId, r.mime_type as string);
      await copyObject(r.storage_path as string, path);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, photo_id, user_id, storage_path, source_revision_id, ...rest } = r;
      return {
        ...rest,
        id: newId,
        photo_id: newPhotoId,
        user_id: userId,
        storage_path: path,
        source_revision_id: source_revision_id ? revIds.get(source_revision_id as string) ?? null : null,
      };
    }),
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, project_id, user_id, storage_path, active_revision_id, created_at, updated_at, ...rest } = photo;
  const { error } = await db()
    .from("library_photos")
    .insert({
      ...rest,
      id: newPhotoId,
      project_id: projectId,
      user_id: userId,
      storage_path: originalPath,
      position,
      // Kept so this copy still counts as uploaded in the year it was taken into the app.
      created_at,
    });
  if (error) throw new Error(error.message);

  if (revCopies.length > 0) {
    const { error: revError } = await db().from("library_sheet_revisions").insert(revCopies);
    if (revError) throw new Error(revError.message);
  }
  const activeId = active_revision_id ? revIds.get(active_revision_id as string) : undefined;
  if (activeId) {
    const { error: activeError } = await db()
      .from("library_photos")
      .update({ active_revision_id: activeId })
      .eq("id", newPhotoId);
    if (activeError) throw new Error(activeError.message);
  }
}

export async function createProjectFromPhotos(
  userId: string,
  name: string,
  photoIds: unknown,
): Promise<ApiResult<LibraryProject>> {
  if (!Array.isArray(photoIds) || photoIds.length === 0) return err("Pick at least one photo.", "INVALID");
  if (photoIds.length > MAX_YEAR_ALBUM_PHOTOS) {
    return err(`An album can start with up to ${MAX_YEAR_ALBUM_PHOTOS} photos.`, "INVALID");
  }
  const ids = [...new Set(photoIds.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
  if (ids.length === 0) return err("Pick at least one photo.", "INVALID");

  // Only photos in albums the caller owns (library_photos.user_id is the album owner).
  const { data: photos, error } = await db().from("library_photos").select("*").in("id", ids).eq("user_id", userId);
  if (error) return err(error.message);
  if (!photos?.length) return err("Those photos aren't available.", "NOT_FOUND");
  const byId = new Map(photos.map((p) => [p.id as string, p]));
  const ordered = ids.map((id) => byId.get(id)).filter((p): p is Row => Boolean(p));

  const { data: revisions, error: revError } = await db()
    .from("library_sheet_revisions")
    .select("*")
    .in("photo_id", ordered.map((p) => p.id as string))
    .order("created_at", { ascending: true });
  if (revError) return err(revError.message);
  const revsByPhoto = new Map<string, Row[]>();
  for (const r of revisions ?? []) {
    const list = revsByPhoto.get(r.photo_id as string) ?? [];
    list.push(r);
    revsByPhoto.set(r.photo_id as string, list);
  }

  const created = await createProject(userId, name);
  if (created.error) return created;
  const project = created.data!;

  let copied = 0;
  await forEachLimited(ordered, COPY_CONCURRENCY, async (photo, index) => {
    try {
      await copyPhoto(userId, project.id, photo, revsByPhoto.get(photo.id as string) ?? [], index);
      copied++;
    } catch (e) {
      // One unreadable photo shouldn't sink the album; it's simply left out.
      log("warn", "year album: photo copy failed", { userId, photoId: photo.id, error: String(e) });
    }
  });
  log("info", "year album created", { userId, projectId: project.id, requested: ids.length, copied });
  return { data: { ...project, photoCount: copied }, error: null };
}
