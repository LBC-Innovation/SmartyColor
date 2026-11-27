import "server-only";
import type { ApiResult } from "@/lib/api/types";
import type {
  AdminAlbum,
  AdminAlbumPhoto,
  AdminAlbumPrepaid,
  AdminBookPageStatus,
  AdminUserAlbums,
} from "@/lib/admin/userAlbums";
import { BOOK_BINDINGS, type BookBindingId } from "@/lib/print/bookBindings";
import { getSupabaseAdmin } from "@/lib/supabase/service";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

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

  const [photoRes, shareRes, orderRes, codeRes] = await Promise.all([
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
    Promise.all(
      chunks(projectIds).map((ids) =>
        db
          .from("purchase_codes")
          .select(
            "id, code, project_id, source, status, binding_id, included_pages, pages_used, package_price_cents, paid_with, book_order_id, refunded_at",
          )
          .in("project_id", ids),
      ),
    ),
  ]);
  const firstError = [...photoRes, ...shareRes, ...orderRes, ...codeRes].find((r) => r.error)?.error;
  if (firstError) return { data: null, error: { message: firstError.message } };

  const photos = photoRes.flatMap((r) => r.data ?? []);
  const revisions = await Promise.all(
    chunks(photos.map((p) => p.id as string)).map((ids) => db.from("library_sheet_revisions").select("id, photo_id, kind").in("photo_id", ids)),
  );
  const revError = revisions.find((r) => r.error)?.error;
  if (revError) return { data: null, error: { message: revError.message } };

  // The pre-paid book each album has (at most one, any status), which photos it includes, and
  // which pages outside it were paid from the wallet.
  const codes = codeRes.flatMap((r) => r.data ?? []);
  const codeByProject = new Map(codes.map((c) => [c.project_id as string, c]));
  const [useRes, chargeRes] = await Promise.all([
    Promise.all(
      chunks(codes.map((c) => c.id as string)).map((ids) =>
        db.from("purchase_code_photos").select("code_id, photo_id, brought_in, granted_by, granted_extra").in("code_id", ids),
      ),
    ),
    Promise.all(
      chunks(photos.filter((p) => codeByProject.has(p.project_id as string)).map((p) => p.id as string)).map((ids) =>
        db
          .from("credit_ledger")
          .select("reference_id")
          .eq("reference_type", "library_photo")
          .eq("reason", "sheet_generation")
          .in("reference_id", ids),
      ),
    ),
  ]);
  const codeError = [...useRes, ...chargeRes].find((r) => r.error)?.error;
  if (codeError) return { data: null, error: { message: codeError.message } };
  const uses = new Map(useRes.flatMap((r) => r.data ?? []).map((u) => [u.photo_id as string, u]));
  const charged = new Set(chargeRes.flatMap((r) => r.data ?? []).map((r) => r.reference_id as string));

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

  const bookPage = (photoId: string, projectId: string, hasPage: boolean): AdminBookPageStatus | null => {
    if (!codeByProject.has(projectId)) return null;
    const use = uses.get(photoId);
    if (use) return use.granted_by ? "granted" : use.brought_in ? "brought_in" : "included";
    if (!hasPage) return "no_page";
    return charged.has(photoId) ? "extra_paid" : "extra";
  };

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
      bookPage: bookPage(id, p.project_id as string, (sheets.get(id) ?? 0) > 0),
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
      prepaid: prepaidFor(codeByProject.get(id), [...uses.values()]),
      photos: (photosByProject.get(id) ?? []).sort((a, b) => a.position - b.position),
    };
  });
  albums.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return { data: { albums }, error: null };
}

function prepaidFor(
  row: Record<string, unknown> | undefined,
  uses: Array<Record<string, unknown>>,
): AdminAlbumPrepaid | null {
  if (!row) return null;
  const mine = uses.filter((u) => u.code_id === row.id);
  const bindingId = row.binding_id as string;
  return {
    codeId: row.id as string,
    code: row.code as string,
    source: row.source === "package" ? "package" : "admin",
    status: row.status === "void" ? "void" : "active",
    bindingId,
    bindingLabel: BOOK_BINDINGS[bindingId as BookBindingId]?.shortLabel ?? bindingId,
    includedPages: (row.included_pages as number) ?? 0,
    pagesUsed: (row.pages_used as number) ?? 0,
    includedNow: mine.length,
    grantedExtra: mine.filter((u) => u.granted_extra === true).length,
    priceCents: (row.package_price_cents as number | null) ?? null,
    paidWith: (row.paid_with as string | null) ?? null,
    bookOrderId: (row.book_order_id as string | null) ?? null,
    refundedAt: (row.refunded_at as string | null) ?? null,
  };
}

const SET_PAGE_ERRORS: Array<[RegExp, string, string]> = [
  [/photo not found/i, "That photo isn't in the album any more.", "NOT_FOUND"],
  [/no active package/i, "This album has no active pre-paid book.", "INVALID"],
  [/book already ordered/i, "This book has already been ordered, so its pages can't change.", "INVALID"],
];

/**
 * An admin includes a page in the album's pre-paid book, or takes it out. Including fills a free
 * slot, or grows the book by one page when it is full; nothing is charged (admin_set_package_page,
 * migration 0051).
 */
export async function setPackagePage(
  adminId: string,
  photoId: string,
  include: boolean,
): Promise<ApiResult<{ included: boolean; changed: boolean }>> {
  const { data, error } = await getSupabaseAdmin().rpc("admin_set_package_page", {
    p_photo_id: photoId,
    p_include: include,
    p_admin_id: adminId,
  });
  if (error) {
    const known = SET_PAGE_ERRORS.find(([re]) => re.test(error.message));
    return { data: null, error: known ? { message: known[1], code: known[2] } : { message: error.message } };
  }
  const r = (data ?? {}) as { included?: boolean; changed?: boolean; grewBook?: boolean; shrankBook?: boolean };
  log("info", include ? "Admin included a page in a pre-paid book" : "Admin took a page out of a pre-paid book", {
    adminId,
    photoId,
    grewBook: r.grewBook ?? false,
    shrankBook: r.shrankBook ?? false,
  });
  return { data: { included: r.included === include, changed: r.changed === true }, error: null };
}
