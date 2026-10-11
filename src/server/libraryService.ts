import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import type { ApiResult } from "@/lib/api/types";
import type { GeneratedSheet } from "@/lib/session/types";
import type { PrintPrefs } from "@/lib/print/settings";
import { defaultPrintPrefs } from "@/lib/print/settings";
import {
  type LibraryPhoto,
  type LibraryPhotoPatch,
  type LibraryProject,
  type LibraryProjectPatch,
  type LibraryRevision,
  type RegisterPhotoInput,
  type SignedUpload,
} from "@/lib/library/types";
import {
  createSignedUpload,
  getObjectBytes,
  libraryPaths,
  objectExists,
  putObject,
  removePrefix,
  signedReadUrls,
} from "@/server/storage/libraryFiles";

type Row = Record<string, unknown>;
const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });
const NOT_FOUND = err("Not found", "NOT_FOUND");

function db() {
  return getSupabaseAdmin();
}

// ---------------------------------------------------------------- projects

function projectFromRow(row: Row, photoCount: number): LibraryProject {
  return {
    id: row.id as string,
    name: row.name as string,
    photoCount,
    selectedPhotoId: (row.selected_photo_id as string | null) ?? null,
    studioLayout: (row.studio_layout as string) ?? "both",
    tripNarrative: (row.trip_narrative as string) ?? "",
    familyContext: (row.family_context as string) ?? "",
    generatedStory: row.generated_story ?? null,
    printArtMode: (row.print_art_mode as string | null) ?? null,
    storyPhase: (row.story_phase as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listProjects(userId: string): Promise<ApiResult<LibraryProject[]>> {
  const { data, error } = await db()
    .from("library_projects")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return err(error.message);

  const ids = (data ?? []).map((r) => r.id as string);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: photos, error: pErr } = await db()
      .from("library_photos")
      .select("project_id")
      .eq("user_id", userId)
      .in("project_id", ids);
    if (pErr) return err(pErr.message);
    for (const p of photos ?? []) {
      const pid = p.project_id as string;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
  }
  return { data: (data ?? []).map((r) => projectFromRow(r, counts.get(r.id as string) ?? 0)), error: null };
}

export async function createProject(userId: string, name: string): Promise<ApiResult<LibraryProject>> {
  const { data, error } = await db()
    .from("library_projects")
    .insert({ user_id: userId, name: name.trim() || "Untitled project" })
    .select("*")
    .single();
  if (error) return err(error.message);
  return { data: projectFromRow(data, 0), error: null };
}

export async function updateProject(
  userId: string,
  projectId: string,
  patch: LibraryProjectPatch,
): Promise<ApiResult<LibraryProject>> {
  const update: Row = {};
  if (patch.name !== undefined) update.name = patch.name.trim() || "Untitled project";
  if (patch.selectedPhotoId !== undefined) update.selected_photo_id = patch.selectedPhotoId;
  if (patch.studioLayout !== undefined) update.studio_layout = patch.studioLayout;
  if (patch.tripNarrative !== undefined) update.trip_narrative = patch.tripNarrative;
  if (patch.familyContext !== undefined) update.family_context = patch.familyContext;
  if (patch.generatedStory !== undefined) update.generated_story = patch.generatedStory;
  if (patch.printArtMode !== undefined) update.print_art_mode = patch.printArtMode;
  if (patch.storyPhase !== undefined) update.story_phase = patch.storyPhase;

  const { data, error } = await db()
    .from("library_projects")
    .update(update)
    .eq("id", projectId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) return err(error.message);
  if (!data) return NOT_FOUND;
  const { count } = await db()
    .from("library_photos")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  return { data: projectFromRow(data, count ?? 0), error: null };
}

/** Deletes the project row (cascades photos/revisions) and every file under it. */
export async function deleteProject(userId: string, projectId: string): Promise<ApiResult<{ id: string }>> {
  const { data, error } = await db()
    .from("library_projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return err(error.message);
  if (!data) return NOT_FOUND;
  try {
    await removePrefix(libraryPaths.project(userId, projectId));
  } catch (e) {
    // Row is gone; orphaned files are harmless and can be swept later.
    console.error(JSON.stringify({ level: "warn", message: "library: file cleanup failed", projectId, error: String(e) }));
  }
  return { data: { id: projectId }, error: null };
}

// ------------------------------------------------------------------ photos

function revisionFromRow(row: Row, url: string): LibraryRevision {
  return {
    id: row.id as string,
    storagePath: row.storage_path as string,
    mimeType: row.mime_type as string,
    title: (row.title as string) ?? "",
    createdAt: row.created_at as string,
    url,
  };
}

function photoFromRow(row: Row, revisions: LibraryRevision[], url: string): LibraryPhoto {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    position: row.position as number,
    storagePath: row.storage_path as string,
    mimeType: row.mime_type as string,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    orientation: (row.orientation as string | null) ?? null,
    aspectRatio: (row.aspect_ratio as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    capturedAt: (row.captured_at as string | null) ?? null,
    printPrefs: { ...defaultPrintPrefs, ...((row.print_prefs as Partial<PrintPrefs>) ?? {}) },
    userCaption: (row.user_caption as string) ?? "",
    chatMessages: (row.chat_messages as LibraryPhoto["chatMessages"]) ?? [],
    photoSummary: (row.photo_summary as string | null) ?? null,
    crop: (row.crop as LibraryPhoto["crop"]) ?? null,
    activeRevisionId: (row.active_revision_id as string | null) ?? null,
    revisions,
    url,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function hydratePhotos(rows: Row[]): Promise<ApiResult<LibraryPhoto[]>> {
  if (rows.length === 0) return { data: [], error: null };
  const photoIds = rows.map((r) => r.id as string);
  const { data: revRows, error } = await db()
    .from("library_sheet_revisions")
    .select("*")
    .in("photo_id", photoIds)
    .order("created_at", { ascending: true });
  if (error) return err(error.message);

  const paths = [
    ...rows.map((r) => r.storage_path as string),
    ...(revRows ?? []).map((r) => r.storage_path as string),
  ];
  let urls: Map<string, string>;
  try {
    urls = await signedReadUrls(paths);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not sign image URLs");
  }

  const revsByPhoto = new Map<string, LibraryRevision[]>();
  for (const r of revRows ?? []) {
    const pid = r.photo_id as string;
    const list = revsByPhoto.get(pid) ?? [];
    list.push(revisionFromRow(r, urls.get(r.storage_path as string) ?? ""));
    revsByPhoto.set(pid, list);
  }
  return {
    data: rows.map((r) =>
      photoFromRow(r, revsByPhoto.get(r.id as string) ?? [], urls.get(r.storage_path as string) ?? ""),
    ),
    error: null,
  };
}

export async function listPhotos(userId: string, projectId: string): Promise<ApiResult<LibraryPhoto[]>> {
  const { data, error } = await db()
    .from("library_photos")
    .select("*")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return err(error.message);
  return hydratePhotos(data ?? []);
}

export async function getPhoto(userId: string, photoId: string): Promise<ApiResult<LibraryPhoto>> {
  const { data, error } = await db()
    .from("library_photos")
    .select("*")
    .eq("user_id", userId)
    .eq("id", photoId)
    .maybeSingle();
  if (error) return err(error.message);
  if (!data) return NOT_FOUND;
  const hydrated = await hydratePhotos([data]);
  if (hydrated.error) return hydrated;
  return { data: hydrated.data![0], error: null };
}

/** Step 1 of adding a photo: the client gets a signed PUT for the original. */
export async function createPhotoUpload(
  userId: string,
  projectId: string,
  mimeType: string,
): Promise<ApiResult<SignedUpload & { photoId: string }>> {
  const { data: project, error } = await db()
    .from("library_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return err(error.message);
  if (!project) return NOT_FOUND;
  const photoId = crypto.randomUUID();
  try {
    const upload = await createSignedUpload(libraryPaths.original(userId, projectId, photoId, mimeType));
    return { data: { ...upload, photoId }, error: null };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not create upload URL");
  }
}

/** Step 2: after the PUT succeeds, record the photo. Verifies the object exists. */
export async function registerPhoto(
  userId: string,
  projectId: string,
  input: RegisterPhotoInput,
): Promise<ApiResult<LibraryPhoto>> {
  const path = libraryPaths.original(userId, projectId, input.id, input.mimeType);
  try {
    if (!(await objectExists(path))) return err("Upload not found — try again.", "UPLOAD_MISSING");
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not verify upload");
  }

  let position = input.position;
  if (position == null) {
    const { data: last } = await db()
      .from("library_photos")
      .select("position")
      .eq("project_id", projectId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    position = ((last?.position as number | undefined) ?? -1) + 1;
  }

  const { data, error } = await db()
    .from("library_photos")
    .insert({
      id: input.id,
      project_id: projectId,
      user_id: userId,
      position,
      storage_path: path,
      mime_type: input.mimeType,
      width: input.width,
      height: input.height,
      orientation: input.orientation,
      aspect_ratio: input.aspectRatio,
      file_name: input.fileName ?? null,
      captured_at: input.capturedAt ?? null,
      print_prefs: input.printPrefs,
    })
    .select("*")
    .single();
  if (error) return err(error.message);
  const hydrated = await hydratePhotos([data]);
  if (hydrated.error) return hydrated;
  return { data: hydrated.data![0], error: null };
}

export async function updatePhoto(
  userId: string,
  photoId: string,
  patch: LibraryPhotoPatch,
): Promise<ApiResult<LibraryPhoto>> {
  const update: Row = {};
  if (patch.printPrefs !== undefined) update.print_prefs = patch.printPrefs;
  if (patch.userCaption !== undefined) update.user_caption = patch.userCaption;
  if (patch.chatMessages !== undefined) update.chat_messages = patch.chatMessages;
  if (patch.photoSummary !== undefined) update.photo_summary = patch.photoSummary;
  if (patch.crop !== undefined) update.crop = patch.crop;
  if (patch.activeRevisionId !== undefined) update.active_revision_id = patch.activeRevisionId;

  const { data, error } = await db()
    .from("library_photos")
    .update(update)
    .eq("id", photoId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) return err(error.message);
  if (!data) return NOT_FOUND;
  const hydrated = await hydratePhotos([data]);
  if (hydrated.error) return hydrated;
  return { data: hydrated.data![0], error: null };
}

export async function reorderPhotos(
  userId: string,
  projectId: string,
  orderedIds: string[],
): Promise<ApiResult<{ ok: true }>> {
  // One update per row; libraries are small and this keeps RLS semantics simple.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db()
      .from("library_photos")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("project_id", projectId)
      .eq("user_id", userId);
    if (error) return err(error.message);
  }
  return { data: { ok: true }, error: null };
}

export async function deletePhotos(userId: string, photoIds: string[]): Promise<ApiResult<{ deleted: string[] }>> {
  if (photoIds.length === 0) return { data: { deleted: [] }, error: null };
  const { data, error } = await db()
    .from("library_photos")
    .delete()
    .in("id", photoIds)
    .eq("user_id", userId)
    .select("id, project_id");
  if (error) return err(error.message);
  for (const row of data ?? []) {
    try {
      await removePrefix(libraryPaths.photoDir(userId, row.project_id as string, row.id as string));
    } catch (e) {
      console.error(JSON.stringify({ level: "warn", message: "library: photo file cleanup failed", photoId: row.id, error: String(e) }));
    }
  }
  return { data: { deleted: (data ?? []).map((r) => r.id as string) }, error: null };
}

// --------------------------------------------------------------- revisions

/** Read a photo's original bytes (for generation) and its ownership context. */
export async function loadPhotoBytes(
  userId: string,
  photoId: string,
): Promise<ApiResult<{ photo: LibraryPhoto; bytes: Buffer; mime: string }>> {
  const photo = await getPhoto(userId, photoId);
  if (photo.error) return photo;
  try {
    const obj = await getObjectBytes(photo.data!.storagePath);
    return { data: { photo: photo.data!, bytes: obj.bytes, mime: obj.mime || photo.data!.mimeType }, error: null };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not read photo");
  }
}

export async function loadRevisionBytes(
  userId: string,
  revisionId: string,
): Promise<ApiResult<{ bytes: Buffer; mime: string; title: string }>> {
  const { data, error } = await db()
    .from("library_sheet_revisions")
    .select("storage_path, mime_type, title")
    .eq("id", revisionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return err(error.message);
  if (!data) return NOT_FOUND;
  try {
    const obj = await getObjectBytes(data.storage_path as string);
    return { data: { bytes: obj.bytes, mime: obj.mime || (data.mime_type as string), title: (data.title as string) ?? "" }, error: null };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not read sheet");
  }
}

/** Store a generated sheet as a new revision and make it active. */
export async function addRevisionFromSheet(
  userId: string,
  photo: Pick<LibraryPhoto, "id" | "projectId">,
  sheet: GeneratedSheet,
): Promise<ApiResult<LibraryPhoto>> {
  const match = sheet.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return err("Generated sheet was not an image");
  const mime = match[1];
  const bytes = Buffer.from(match[2], "base64");
  return addRevisionFromBytes(userId, photo, { bytes, mime, title: sheet.title });
}

export async function addRevisionFromBytes(
  userId: string,
  photo: Pick<LibraryPhoto, "id" | "projectId">,
  input: { bytes: Buffer | Uint8Array; mime: string; title: string },
): Promise<ApiResult<LibraryPhoto>> {
  const revisionId = crypto.randomUUID();
  const path = libraryPaths.sheet(userId, photo.projectId, photo.id, revisionId, input.mime);
  try {
    await putObject(path, input.bytes, input.mime);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not store sheet");
  }
  const { error } = await db().from("library_sheet_revisions").insert({
    id: revisionId,
    photo_id: photo.id,
    user_id: userId,
    storage_path: path,
    mime_type: input.mime,
    title: input.title,
  });
  if (error) return err(error.message);
  return updatePhoto(userId, photo.id, { activeRevisionId: revisionId });
}

/** For migrating a locally generated sheet: signed PUT for a revision file, then register. */
export async function createRevisionUpload(
  userId: string,
  photoId: string,
  mimeType: string,
): Promise<ApiResult<SignedUpload & { revisionId: string }>> {
  const photo = await getPhoto(userId, photoId);
  if (photo.error) return photo;
  const revisionId = crypto.randomUUID();
  try {
    const upload = await createSignedUpload(
      libraryPaths.sheet(userId, photo.data!.projectId, photoId, revisionId, mimeType),
    );
    return { data: { ...upload, revisionId }, error: null };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not create upload URL");
  }
}

export async function registerRevision(
  userId: string,
  photoId: string,
  input: { revisionId: string; mimeType: string; title: string; makeActive: boolean },
): Promise<ApiResult<LibraryPhoto>> {
  const photo = await getPhoto(userId, photoId);
  if (photo.error) return photo;
  const path = libraryPaths.sheet(userId, photo.data!.projectId, photoId, input.revisionId, input.mimeType);
  try {
    if (!(await objectExists(path))) return err("Upload not found — try again.", "UPLOAD_MISSING");
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not verify upload");
  }
  const { error } = await db().from("library_sheet_revisions").insert({
    id: input.revisionId,
    photo_id: photoId,
    user_id: userId,
    storage_path: path,
    mime_type: input.mimeType,
    title: input.title,
  });
  if (error) return err(error.message);
  if (input.makeActive) return updatePhoto(userId, photoId, { activeRevisionId: input.revisionId });
  return getPhoto(userId, photoId);
}
