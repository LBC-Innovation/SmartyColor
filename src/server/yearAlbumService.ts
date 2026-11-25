import "server-only";
import type { ApiResult } from "@/lib/api/types";
import type { LibraryProject, YearPhoto } from "@/lib/library/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { createProject } from "@/server/libraryService";
import { claimMadePagesForCode } from "@/server/purchaseCodesService";
import { libraryPaths, signedReadUrls } from "@/server/storage/libraryFiles";
import { copyPhoto, revisionsByPhoto } from "@/server/photoCopy";

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

type Chosen = { ordered: Row[]; revsByPhoto: Map<string, Row[]>; requested: number };

/** The caller's own photos among `photoIds`, in the order given, with their coloring pages. */
async function chosenPhotos(userId: string, photoIds: unknown): Promise<ApiResult<Chosen>> {
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

  try {
    const revsByPhoto = await revisionsByPhoto(ordered.map((p) => p.id as string));
    return { data: { ordered, revsByPhoto, requested: ids.length }, error: null };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not read coloring pages");
  }
}

/** Copies each photo (and its pages) into the album from `firstPosition` on; returns how many made it. */
async function copyInto(userId: string, projectId: string, chosen: Chosen, firstPosition: number): Promise<number> {
  let copied = 0;
  await forEachLimited(chosen.ordered, COPY_CONCURRENCY, async (photo, index) => {
    try {
      await copyPhoto(photo, chosen.revsByPhoto.get(photo.id as string) ?? [], {
        projectId,
        ownerId: userId,
        position: firstPosition + index,
        keepCreatedAt: true,
      });
      copied++;
    } catch (e) {
      // One unreadable photo shouldn't sink the album; it's simply left out.
      log("warn", "year album: photo copy failed", { userId, photoId: photo.id, error: String(e) });
    }
  });
  return copied;
}

export async function createProjectFromPhotos(
  userId: string,
  name: string,
  photoIds: unknown,
): Promise<ApiResult<LibraryProject>> {
  const chosen = await chosenPhotos(userId, photoIds);
  if (chosen.error) return chosen;

  const created = await createProject(userId, name);
  if (created.error) return created;
  const project = created.data!;

  const copied = await copyInto(userId, project.id, chosen.data, 0);
  log("info", "year album created", { userId, projectId: project.id, requested: chosen.data.requested, copied });
  return { data: { ...project, photoCount: copied }, error: null };
}

/**
 * Copies of these photos added to an album the caller owns, after the photos already in it. Used
 * when the year's album was made through the book wizard first (book, pay, theme) and then filled.
 */
export async function copyPhotosIntoProject(
  userId: string,
  projectId: string,
  photoIds: unknown,
): Promise<ApiResult<{ copied: number }>> {
  const { data: project, error: projectErr } = await db()
    .from("library_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (projectErr) return err(projectErr.message);
  if (!project) return err("Album not found.", "NOT_FOUND");

  const chosen = await chosenPhotos(userId, photoIds);
  if (chosen.error) return chosen;

  const { data: last, error: posErr } = await db()
    .from("library_photos")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (posErr) return err(posErr.message);
  const first = typeof last?.position === "number" ? last.position + 1 : 0;

  const copied = await copyInto(userId, projectId, chosen.data, first);
  // A book package counts pages that came in already made, in album order, before any others.
  const claimed = copied > 0 ? await claimMadePagesForCode(projectId) : 0;
  log("info", "year photos added", { userId, projectId, requested: chosen.data.requested, copied, claimed });
  if (copied === 0) return err("Those photos couldn't be copied. Please try again.");
  return { data: { copied }, error: null };
}
