import "server-only";
import type { ApiResult } from "@/lib/api/types";
import type { AdminAlbum, AdminAlbumPhoto, AdminUserAlbums } from "@/lib/admin/userAlbums";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/** Long id lists go to PostgREST as a query string, so ask in pieces. */
const CHUNK = 150;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Every album the customer owns or was invited to, with each photo's page and version counts. */
export async function getUserAlbums(userId: string): Promise<ApiResult<AdminUserAlbums>> {
  const db = getSupabaseAdmin();
  const projectCols = "id, user_id, name, created_at, updated_at, design_theme, story_phase, generated_story";

  const [owned, memberships] = await Promise.all([
    db.from("library_projects").select(projectCols).eq("user_id", userId),
    db.from("library_project_shares").select("project_id, status").eq("user_id", userId),
  ]);
  if (owned.error) return { data: null, error: { message: owned.error.message } };
  if (memberships.error) return { data: null, error: { message: memberships.error.message } };

  const shareStatus = new Map((memberships.data ?? []).map((m) => [m.project_id as string, m.status as string]));
  const ownedIds = new Set((owned.data ?? []).map((p) => p.id as string));
  const sharedIds = [...shareStatus.keys()].filter((id) => !ownedIds.has(id));
  const shared = sharedIds.length ? await db.from("library_projects").select(projectCols).in("id", sharedIds) : { data: [], error: null };
  if (shared.error) return { data: null, error: { message: shared.error.message } };

  const projects = [...(owned.data ?? []), ...(shared.data ?? [])];
  const projectIds = projects.map((p) => p.id as string);
  if (projectIds.length === 0) return { data: { albums: [] }, error: null };

  const [photoRes, shareRes, orderRes] = await Promise.all([
    Promise.all(
      chunks(projectIds).map((ids) =>
        db
          .from("library_photos")
          .select("id, project_id, position, file_name, orientation, width, height, created_at, uploaded_by, user_id, edit_count, active_revision_id")
          .in("project_id", ids),
      ),
    ),
    Promise.all(chunks(projectIds).map((ids) => db.from("library_project_shares").select("project_id").in("project_id", ids))),
    Promise.all(chunks(projectIds).map((ids) => db.from("book_orders").select("project_id").in("project_id", ids))),
  ]);
  const firstError = [...photoRes, ...shareRes, ...orderRes].find((r) => r.error)?.error;
  if (firstError) return { data: null, error: { message: firstError.message } };

  const photos = photoRes.flatMap((r) => r.data ?? []);
  const revisions = await Promise.all(
    chunks(photos.map((p) => p.id as string)).map((ids) => db.from("library_sheet_revisions").select("id, photo_id, kind").in("photo_id", ids)),
  );
  const revError = revisions.find((r) => r.error)?.error;
  if (revError) return { data: null, error: { message: revError.message } };

  const revKind = new Map<string, string>();
  const sheets = new Map<string, number>();
  const others = new Map<string, number>();
  for (const r of revisions.flatMap((x) => x.data ?? [])) {
    const photoId = r.photo_id as string;
    revKind.set(r.id as string, r.kind as string);
    const target = r.kind === "sheet" ? sheets : others;
    target.set(photoId, (target.get(photoId) ?? 0) + 1);
  }

  const countBy = (rows: Array<{ project_id: unknown }>) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.project_id as string, (m.get(r.project_id as string) ?? 0) + 1);
    return m;
  };
  const shareCounts = countBy(shareRes.flatMap((r) => r.data ?? []));
  const orderCounts = countBy(orderRes.flatMap((r) => r.data ?? []));

  const photosByProject = new Map<string, AdminAlbumPhoto[]>();
  for (const p of photos) {
    const id = p.id as string;
    const active = p.active_revision_id as string | null;
    const list = photosByProject.get(p.project_id as string) ?? [];
    list.push({
      id,
      position: (p.position as number) ?? 0,
      fileName: (p.file_name as string | null) ?? null,
      orientation: (p.orientation as string | null) ?? null,
      width: (p.width as number | null) ?? null,
      height: (p.height as number | null) ?? null,
      createdAt: p.created_at as string,
      uploadedByOther: p.uploaded_by != null && p.uploaded_by !== p.user_id,
      sheetCount: sheets.get(id) ?? 0,
      otherVersionCount: others.get(id) ?? 0,
      editCount: (p.edit_count as number | null) ?? 0,
      activeVersionKind: active ? (revKind.get(active) ?? "missing") : null,
    });
    photosByProject.set(p.project_id as string, list);
  }

  const albums: AdminAlbum[] = projects.map((p) => {
    const id = p.id as string;
    const isOwner = p.user_id === userId;
    return {
      id,
      name: (p.name as string) || "Untitled album",
      role: isOwner ? "owner" : "member",
      shareStatus: isOwner ? null : (shareStatus.get(id) ?? null),
      createdAt: p.created_at as string,
      updatedAt: p.updated_at as string,
      designTheme: (p.design_theme as string | null) ?? null,
      storyPhase: (p.story_phase as string | null) ?? null,
      hasStory: p.generated_story != null,
      shareCount: shareCounts.get(id) ?? 0,
      bookOrderCount: orderCounts.get(id) ?? 0,
      photos: (photosByProject.get(id) ?? []).sort((a, b) => a.position - b.position),
    };
  });
  albums.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return { data: { albums }, error: null };
}
