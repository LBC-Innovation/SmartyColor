import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import type { ApiResult } from "@/lib/api/types";
import type { GeneratedSheet } from "@/lib/session/types";
import type { PrintPrefs } from "@/lib/print/settings";
import { defaultPrintPrefs } from "@/lib/print/settings";
import {
  type LibraryPhoto,
  type LibraryProjectRole,
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
import { claimPendingShares, photoAccess, projectAccess, type ProjectAccess } from "@/server/libraryAccess";

type Row = Record<string, unknown>;
const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });
const NOT_FOUND = err("Not found", "NOT_FOUND");

function db() {
  return getSupabaseAdmin();
}

/** Access lookups throw on database errors; fold those into the ApiResult shape. */
async function accessFor(userId: string, projectId: string): Promise<ApiResult<ProjectAccess>> {
  try {
    const access = await projectAccess(userId, projectId);
    return access ? { data: access, error: null } : NOT_FOUND;
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not check album access");
  }
}

async function photoContext(
  userId: string,
  photoId: string,
): Promise<ApiResult<{ row: Row; access: ProjectAccess }>> {
  try {
    const found = await photoAccess(userId, photoId);
    return found ? { data: found, error: null } : NOT_FOUND;
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not check album access");
  }
}

/** Who is looking: decides per-photo permissions in the wire shape. */
type Viewer = { userId: string; role: LibraryProjectRole };

// ---------------------------------------------------------------- projects

type ProjectExtras = {
  role?: LibraryProjectRole;
  ownerName?: string | null;
  sharedCount?: number;
  /** Contributor's own view state, which replaces the owner's. */
  share?: Row | null;
};

function projectFromRow(row: Row, photoCount: number, extras: ProjectExtras = {}): LibraryProject {
  const base = baseProjectFromRow(row, photoCount);
  const share = extras.share;
  return {
    ...base,
    ...(share
      ? {
          selectedPhotoId: (share.selected_photo_id as string | null) ?? null,
          studioLayout: (share.studio_layout as string | null) ?? "both",
        }
      : {}),
    role: extras.role ?? "owner",
    ownerName: extras.ownerName ?? null,
    sharedCount: extras.sharedCount ?? 0,
  };
}

function baseProjectFromRow(row: Row, photoCount: number): Omit<LibraryProject, "role" | "ownerName" | "sharedCount"> {
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

export async function listProjects(
  userId: string,
  /** Pass the caller's address to pick up albums shared with it before they had an account. */
  claim?: { email: string; emailVerified: boolean },
): Promise<ApiResult<LibraryProject[]>> {
  if (claim?.emailVerified && claim.email) await claimPendingShares(userId, claim.email);

  const { data: owned, error } = await db()
    .from("library_projects")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return err(error.message);

  const { data: memberships, error: mErr } = await db()
    .from("library_project_shares")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("accepted_at", { ascending: true });
  if (mErr) return err(mErr.message);

  const shareByProject = new Map<string, Row>();
  for (const m of memberships ?? []) shareByProject.set(m.project_id as string, m);

  let shared: Row[] = [];
  if (shareByProject.size > 0) {
    const { data, error: sErr } = await db()
      .from("library_projects")
      .select("*")
      .in("id", [...shareByProject.keys()]);
    if (sErr) return err(sErr.message);
    const byId = new Map((data ?? []).map((r) => [r.id as string, r as Row]));
    // Keep the order in which the albums were joined; skip any the caller owns.
    shared = [...shareByProject.keys()]
      .map((id) => byId.get(id))
      .filter((r): r is Row => Boolean(r) && r!.user_id !== userId);
  }

  const ownedIds = (owned ?? []).map((r) => r.id as string);
  const ids = [...ownedIds, ...shared.map((r) => r.id as string)];
  const counts = new Map<string, number>();
  const sharedCounts = new Map<string, number>();
  const ownerNames = new Map<string, string>();
  if (ids.length > 0) {
    const { data: photos, error: pErr } = await db()
      .from("library_photos")
      .select("project_id")
      .in("project_id", ids);
    if (pErr) return err(pErr.message);
    for (const p of photos ?? []) {
      const pid = p.project_id as string;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
  }
  if (ownedIds.length > 0) {
    const { data: invites, error: iErr } = await db()
      .from("library_project_shares")
      .select("project_id")
      .in("project_id", ownedIds);
    if (iErr) return err(iErr.message);
    for (const i of invites ?? []) {
      const pid = i.project_id as string;
      sharedCounts.set(pid, (sharedCounts.get(pid) ?? 0) + 1);
    }
  }
  if (shared.length > 0) {
    const ownerIds = [...new Set(shared.map((r) => r.user_id as string))];
    const { data: profiles } = await db().from("profiles").select("id, display_name").in("id", ownerIds);
    for (const p of profiles ?? []) {
      if (p.display_name) ownerNames.set(p.id as string, p.display_name as string);
    }
  }

  return {
    data: [
      ...(owned ?? []).map((r) =>
        projectFromRow(r, counts.get(r.id as string) ?? 0, { sharedCount: sharedCounts.get(r.id as string) ?? 0 }),
      ),
      ...shared.map((r) =>
        projectFromRow(r, counts.get(r.id as string) ?? 0, {
          role: "contributor",
          ownerName: ownerNames.get(r.user_id as string) ?? null,
          share: shareByProject.get(r.id as string) ?? null,
        }),
      ),
    ],
    error: null,
  };
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
  const found = await accessFor(userId, projectId);
  if (found.error) return found;
  const access = found.data!;
  if (access.role === "contributor") return updateContributorView(access, patch);

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
  const [{ count }, { count: sharedCount }] = await Promise.all([
    db().from("library_photos").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    db().from("library_project_shares").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);
  return { data: projectFromRow(data, count ?? 0, { sharedCount: sharedCount ?? 0 }), error: null };
}

/**
 * Contributors keep their own selection and layout on their share row; the
 * album's name and story belong to its owner and are left alone.
 */
async function updateContributorView(
  access: ProjectAccess,
  patch: LibraryProjectPatch,
): Promise<ApiResult<LibraryProject>> {
  const update: Row = {};
  if (patch.selectedPhotoId !== undefined) update.selected_photo_id = patch.selectedPhotoId;
  if (patch.studioLayout !== undefined) update.studio_layout = patch.studioLayout;

  let share = access.share!;
  if (Object.keys(update).length > 0) {
    const { data, error } = await db()
      .from("library_project_shares")
      .update(update)
      .eq("id", share.id as string)
      .select("*")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return NOT_FOUND;
    share = data;
  }
  const projectId = access.project.id as string;
  const { count } = await db()
    .from("library_photos")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  const { data: owner } = await db()
    .from("profiles")
    .select("display_name")
    .eq("id", access.ownerId)
    .maybeSingle();
  return {
    data: projectFromRow(access.project, count ?? 0, {
      role: "contributor",
      ownerName: (owner?.display_name as string | null) ?? null,
      share,
    }),
    error: null,
  };
}

/** Deletes the project row (cascades photos/revisions/shares) and every file under it. Owner only. */
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

function photoFromRow(row: Row, revisions: LibraryRevision[], url: string, viewer: Viewer): LibraryPhoto {
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
    canDelete: viewer.role === "owner" || row.uploaded_by === viewer.userId,
    url,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function hydratePhotos(rows: Row[], viewer: Viewer): Promise<ApiResult<LibraryPhoto[]>> {
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
      photoFromRow(r, revsByPhoto.get(r.id as string) ?? [], urls.get(r.storage_path as string) ?? "", viewer),
    ),
    error: null,
  };
}

export async function listPhotos(userId: string, projectId: string): Promise<ApiResult<LibraryPhoto[]>> {
  const found = await accessFor(userId, projectId);
  if (found.error) return found;
  const access = found.data!;
  const { data, error } = await db()
    .from("library_photos")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return err(error.message);
  return hydratePhotos(applyContributorOrder(data ?? [], access), { userId, role: access.role });
}

/** A contributor's saved arrangement first; photos added since then keep album order at the end. */
function applyContributorOrder(rows: Row[], access: ProjectAccess): Row[] {
  const order = access.share?.photo_order;
  if (!Array.isArray(order) || order.length === 0) return rows;
  const rank = new Map<string, number>(order.map((id, i) => [String(id), i]));
  const arranged = rows.filter((r) => rank.has(r.id as string));
  const rest = rows.filter((r) => !rank.has(r.id as string));
  arranged.sort((x, y) => rank.get(x.id as string)! - rank.get(y.id as string)!);
  return [...arranged, ...rest];
}

export async function getPhoto(userId: string, photoId: string): Promise<ApiResult<LibraryPhoto>> {
  const found = await photoContext(userId, photoId);
  if (found.error) return found;
  const { row, access } = found.data!;
  const hydrated = await hydratePhotos([row], { userId, role: access.role });
  if (hydrated.error) return hydrated;
  return { data: hydrated.data![0], error: null };
}

/** Step 1 of adding a photo: the client gets a signed PUT for the original. */
export async function createPhotoUpload(
  userId: string,
  projectId: string,
  mimeType: string,
): Promise<ApiResult<SignedUpload & { photoId: string }>> {
  const found = await accessFor(userId, projectId);
  if (found.error) return found;
  const photoId = crypto.randomUUID();
  try {
    const upload = await createSignedUpload(
      libraryPaths.original(found.data!.ownerId, projectId, photoId, mimeType),
    );
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
  const found = await accessFor(userId, projectId);
  if (found.error) return found;
  const access = found.data!;
  const path = libraryPaths.original(access.ownerId, projectId, input.id, input.mimeType);
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
      user_id: access.ownerId,
      uploaded_by: userId,
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
  const hydrated = await hydratePhotos([data], { userId, role: access.role });
  if (hydrated.error) return hydrated;
  return { data: hydrated.data![0], error: null };
}

export async function updatePhoto(
  userId: string,
  photoId: string,
  patch: LibraryPhotoPatch,
): Promise<ApiResult<LibraryPhoto>> {
  const found = await photoContext(userId, photoId);
  if (found.error) return found;
  const viewer: Viewer = { userId, role: found.data!.access.role };

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
    .select("*")
    .maybeSingle();
  if (error) return err(error.message);
  if (!data) return NOT_FOUND;
  const hydrated = await hydratePhotos([data], viewer);
  if (hydrated.error) return hydrated;
  return { data: hydrated.data![0], error: null };
}

export async function reorderPhotos(
  userId: string,
  projectId: string,
  orderedIds: string[],
): Promise<ApiResult<{ ok: true }>> {
  const found = await accessFor(userId, projectId);
  if (found.error) return found;
  const access = found.data!;

  // A contributor's arrangement is theirs alone, so it never moves the owner's pages.
  if (access.role === "contributor") {
    const { error } = await db()
      .from("library_project_shares")
      .update({ photo_order: orderedIds })
      .eq("id", access.share!.id as string);
    if (error) return err(error.message);
    return { data: { ok: true }, error: null };
  }

  // One update per row; libraries are small and this keeps RLS semantics simple.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db()
      .from("library_photos")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("project_id", projectId);
    if (error) return err(error.message);
  }
  return { data: { ok: true }, error: null };
}

/** Owners can delete any photo in their albums; contributors only the ones they added. */
export async function deletePhotos(userId: string, photoIds: string[]): Promise<ApiResult<{ deleted: string[] }>> {
  if (photoIds.length === 0) return { data: { deleted: [] }, error: null };
  const { data: rows, error: rErr } = await db()
    .from("library_photos")
    .select("id, project_id, user_id, uploaded_by")
    .in("id", photoIds);
  if (rErr) return err(rErr.message);

  const roles = new Map<string, LibraryProjectRole | null>();
  const allowed: Row[] = [];
  for (const row of rows ?? []) {
    const projectId = row.project_id as string;
    if (!roles.has(projectId)) {
      const found = await accessFor(userId, projectId);
      if (found.error && found.error.code !== "NOT_FOUND") return found;
      roles.set(projectId, found.data?.role ?? null);
    }
    const role = roles.get(projectId);
    if (role === "owner" || (role === "contributor" && row.uploaded_by === userId)) allowed.push(row);
  }
  if (allowed.length === 0) return { data: { deleted: [] }, error: null };

  const { data, error } = await db()
    .from("library_photos")
    .delete()
    .in("id", allowed.map((r) => r.id as string))
    .select("id, project_id, user_id");
  if (error) return err(error.message);
  for (const row of data ?? []) {
    try {
      // Files live under the album owner's folder, whoever uploaded them.
      await removePrefix(libraryPaths.photoDir(row.user_id as string, row.project_id as string, row.id as string));
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
    .select("photo_id, storage_path, mime_type, title")
    .eq("id", revisionId)
    .maybeSingle();
  if (error) return err(error.message);
  if (!data) return NOT_FOUND;
  const found = await photoContext(userId, data.photo_id as string);
  if (found.error) return found;
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
  const found = await accessFor(userId, photo.projectId);
  if (found.error) return found;
  const ownerId = found.data!.ownerId;
  const revisionId = crypto.randomUUID();
  const path = libraryPaths.sheet(ownerId, photo.projectId, photo.id, revisionId, input.mime);
  try {
    await putObject(path, input.bytes, input.mime);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not store sheet");
  }
  const { error } = await db().from("library_sheet_revisions").insert({
    id: revisionId,
    photo_id: photo.id,
    user_id: ownerId,
    created_by: userId,
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
  const found = await photoContext(userId, photoId);
  if (found.error) return found;
  const { row, access } = found.data!;
  const revisionId = crypto.randomUUID();
  try {
    const upload = await createSignedUpload(
      libraryPaths.sheet(access.ownerId, row.project_id as string, photoId, revisionId, mimeType),
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
  const found = await photoContext(userId, photoId);
  if (found.error) return found;
  const { row, access } = found.data!;
  const path = libraryPaths.sheet(access.ownerId, row.project_id as string, photoId, input.revisionId, input.mimeType);
  try {
    if (!(await objectExists(path))) return err("Upload not found — try again.", "UPLOAD_MISSING");
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not verify upload");
  }
  const { error } = await db().from("library_sheet_revisions").insert({
    id: input.revisionId,
    photo_id: photoId,
    user_id: access.ownerId,
    created_by: userId,
    storage_path: path,
    mime_type: input.mimeType,
    title: input.title,
  });
  if (error) return err(error.message);
  if (input.makeActive) return updatePhoto(userId, photoId, { activeRevisionId: input.revisionId });
  return getPhoto(userId, photoId);
}
