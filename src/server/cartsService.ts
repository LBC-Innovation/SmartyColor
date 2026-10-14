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
const SUMMARY_COLUMNS = "id, title, step, binding_id, page_count, photo_count, thumb_path, created_at, updated_at";

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

export async function listCarts(userId: string): Promise<ApiResult<BookCartSummary[]>> {
  const { data, error } = await db()
    .from("book_order_carts")
    .select(SUMMARY_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) return err(error.message);
  const rows = (data ?? []) as Row[];
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

export async function deleteCart(userId: string, cartId: string): Promise<ApiResult<{ id: string }>> {
  const { error } = await db().from("book_order_carts").delete().eq("id", cartId).eq("user_id", userId);
  if (error && error.code !== "22P02") return err(error.message);
  return { data: { id: cartId }, error: null };
}
