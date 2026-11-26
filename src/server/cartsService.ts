import "server-only";
import type { ApiResult } from "@/lib/api/types";
import type { BookCart, BookCartInput, BookCartState, BookCartSummary } from "@/lib/orders/cartTypes";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { photoAccess } from "@/server/libraryAccess";
import { libraryPaths, signedReadUrls } from "@/server/storage/libraryFiles";

type Row = Record<string, unknown>;
const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });
const NOT_FOUND = err("Not found", "NOT_FOUND");

/** A cart is a handful of ids and settings; anything near this is not one. */
const MAX_STATE_BYTES = 256 * 1024;
/** Old carts stay until deleted, but the header only needs the recent ones. */
const LIST_LIMIT = 20;
/** The album a cart was built from: the studio keeps one cart per album. */
const ALBUM_PATH = "state->selectedProjectIds->>0";
const SUMMARY_COLUMNS = `id, title, step, binding_id, page_count, photo_count, thumb_path, created_at, updated_at, album_id:${ALBUM_PATH}`;

function db() {
  return getSupabaseAdmin();
}

function summaryFromRow(row: Row, thumbUrl: string | null): BookCartSummary {
  return {
    id: row.id as string,
    title: row.title as string,
    step: row.step as string,
    bindingId: (row.binding_id as string | null) ?? null,
    pageCount: (row.page_count as number) ?? 0,
    photoCount: (row.photo_count as number) ?? 0,
    projectId: (row.album_id as string | null) ?? null,
    thumbUrl,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function signThumbs(rows: Row[]): Promise<Map<string, string>> {
  const paths = rows.map((r) => r.thumb_path as string | null).filter((p): p is string => Boolean(p));
  if (paths.length === 0) return new Map();
  try {
    const signed = await signedReadUrls(paths.map(libraryPaths.thumb));
    return new Map(paths.map((p) => [p, signed.get(libraryPaths.thumb(p)) ?? ""]));
  } catch {
    // A missing picture never hides the cart.
    return new Map();
  }
}

/** Storage path of a library revision the user can see, or null. */
async function thumbPathFor(userId: string, revisionId: string | null): Promise<string | null> {
  if (!revisionId) return null;
  try {
    const { data } = await db()
      .from("library_sheet_revisions")
      .select("photo_id, storage_path")
      .eq("id", revisionId)
      .maybeSingle();
    if (!data) return null;
    const access = await photoAccess(userId, data.photo_id as string);
    return access ? (data.storage_path as string) : null;
  } catch {
    return null;
  }
}

function validInput(input: BookCartInput): string | null {
  if (!input || typeof input !== "object") return "Cart is required";
  if (!input.state || typeof input.state !== "object" || input.state.v !== 1) return "Cart state is invalid";
  if (JSON.stringify(input.state).length > MAX_STATE_BYTES) return "Cart is too large";
  return null;
}

async function columnsFor(userId: string, input: BookCartInput): Promise<Row> {
  const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  return {
    title: (typeof input.title === "string" && input.title.trim().slice(0, 200)) || "My coloring book",
    step: typeof input.step === "string" ? input.step.slice(0, 32) : "book",
    binding_id: typeof input.bindingId === "string" ? input.bindingId.slice(0, 64) : null,
    page_count: count(input.pageCount),
    photo_count: count(input.photoCount),
    thumb_path: await thumbPathFor(userId, typeof input.thumbRevisionId === "string" ? input.thumbRevisionId : null),
    state: input.state as BookCartState,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Of these album ids, the ones this user can still open (owns, or is an active contributor on),
 * and the ones whose album no longer exists at all. An album that exists but was left or unshared
 * is in neither: its book is hidden, not deleted, in case the user is invited back.
 */
async function albumAvailability(
  userId: string,
  albumIds: string[],
): Promise<{ open: Set<string>; gone: Set<string> } | null> {
  const ids = [...new Set(albumIds.filter((id) => UUID.test(id)))];
  if (ids.length === 0) return { open: new Set(), gone: new Set() };
  const [projects, shares] = await Promise.all([
    db().from("library_projects").select("id, user_id").in("id", ids),
    db()
      .from("library_project_shares")
      .select("project_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .in("project_id", ids),
  ]);
  if (projects.error || shares.error) return null;
  const existing = new Map(((projects.data ?? []) as Row[]).map((p) => [p.id as string, p.user_id as string]));
  const shared = new Set(((shares.data ?? []) as Row[]).map((s) => s.project_id as string));
  const open = new Set(ids.filter((id) => existing.get(id) === userId || (existing.has(id) && shared.has(id))));
  const gone = new Set(ids.filter((id) => !existing.has(id)));
  return { open, gone };
}

export async function listCarts(userId: string): Promise<ApiResult<BookCartSummary[]>> {
  const { data, error } = await db()
    .from("book_order_carts")
    .select(SUMMARY_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) return err(error.message);
  const all = (data ?? []) as Row[];
  // A book made from an album that was deleted (or that this user can no longer open) can't be
  // resumed, so it isn't offered. Books for deleted albums are cleared away for good.
  const availability = await albumAvailability(
    userId,
    all.map((r) => r.album_id as string | null).filter((a): a is string => Boolean(a)),
  );
  if (availability && availability.gone.size > 0) {
    const stale = all.filter((r) => availability.gone.has(r.album_id as string)).map((r) => r.id as string);
    await db().from("book_order_carts").delete().eq("user_id", userId).in("id", stale);
  }
  const reachable = (album: string | null) =>
    !album || !availability || !UUID.test(album) || availability.open.has(album);
  // Newest first, so the first cart seen for an album is the one that counts. Older copies of
  // the same album's book (saved before carts were kept one per album) stay hidden.
  const seenAlbums = new Set<string>();
  const rows = all.filter((r) => {
    const album = r.album_id as string | null;
    if (!reachable(album)) return false;
    if (!album) return true;
    if (seenAlbums.has(album)) return false;
    seenAlbums.add(album);
    return true;
  });
  const thumbs = await signThumbs(rows);
  return {
    data: rows.map((r) => summaryFromRow(r, thumbs.get(r.thumb_path as string) || null)),
    error: null,
  };
}

export async function getCart(userId: string, cartId: string): Promise<ApiResult<BookCart>> {
  const { data, error } = await db()
    .from("book_order_carts")
    .select(`${SUMMARY_COLUMNS}, state`)
    .eq("id", cartId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return error.code === "22P02" ? NOT_FOUND : err(error.message);
  if (!data) return NOT_FOUND;
  const thumbs = await signThumbs([data]);
  return {
    data: {
      ...summaryFromRow(data, thumbs.get(data.thumb_path as string) || null),
      state: data.state as BookCartState,
    },
    error: null,
  };
}

export async function createCart(userId: string, input: BookCartInput): Promise<ApiResult<BookCartSummary>> {
  const invalid = validInput(input);
  if (invalid) return err(invalid, "INVALID_CART");
  // One book per album: a second "new" cart for the same album (another tab, an old page) takes
  // over the existing one instead, and any older copies of it are cleared away.
  const album = Array.isArray(input.state.selectedProjectIds) ? input.state.selectedProjectIds[0] : null;
  if (typeof album === "string" && album) {
    const { data: existing, error: findError } = await db()
      .from("book_order_carts")
      .select("id")
      .eq("user_id", userId)
      .eq(ALBUM_PATH, album)
      .order("updated_at", { ascending: false });
    if (findError) return err(findError.message);
    const [keep, ...stale] = (existing ?? []).map((r) => r.id as string);
    if (keep) {
      if (stale.length > 0) await db().from("book_order_carts").delete().eq("user_id", userId).in("id", stale);
      return updateCart(userId, keep, input);
    }
  }
  const { data, error } = await db()
    .from("book_order_carts")
    .insert({ user_id: userId, ...(await columnsFor(userId, input)) })
    .select(SUMMARY_COLUMNS)
    .single();
  if (error) return err(error.message);
  return { data: summaryFromRow(data, null), error: null };
}

export async function updateCart(
  userId: string,
  cartId: string,
  input: BookCartInput,
): Promise<ApiResult<BookCartSummary>> {
  const invalid = validInput(input);
  if (invalid) return err(invalid, "INVALID_CART");
  const { data, error } = await db()
    .from("book_order_carts")
    .update({ ...(await columnsFor(userId, input)), updated_at: new Date().toISOString() })
    .eq("id", cartId)
    .eq("user_id", userId)
    .select(SUMMARY_COLUMNS)
    .maybeSingle();
  if (error) return error.code === "22P02" ? NOT_FOUND : err(error.message);
  if (!data) return NOT_FOUND;
  return { data: summaryFromRow(data, null), error: null };
}

/** Clears every saved book made from this album, for whoever started it (the album is being deleted). */
export async function deleteCartsForAlbum(albumId: string): Promise<void> {
  if (!UUID.test(albumId)) return;
  const { error } = await db().from("book_order_carts").delete().eq(ALBUM_PATH, albumId);
  if (error) console.error(JSON.stringify({ level: "warn", message: "carts: album cleanup failed", albumId, error: error.message }));
}

export async function deleteCart(userId: string, cartId: string): Promise<ApiResult<{ id: string }>> {
  const { error } = await db().from("book_order_carts").delete().eq("id", cartId).eq("user_id", userId);
  if (error && error.code !== "22P02") return err(error.message);
  return { data: { id: cartId }, error: null };
}
