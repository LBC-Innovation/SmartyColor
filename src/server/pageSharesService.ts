import "server-only";
import { randomBytes } from "node:crypto";
import type { ApiResult } from "@/lib/api/types";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import type { PageShare } from "@/lib/library/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { photoAccess } from "@/server/libraryAccess";
import { getObjectBytes } from "@/server/storage/libraryFiles";

/**
 * Unlisted links to one coloring page. A link names a sheet revision and nothing else: the
 * public page and its image route never read the photo, its caption or the album. Pages are
 * not shared until the owner asks, and a revoked link is dead for good (sharing again makes a
 * new token).
 */

type Row = Record<string, unknown>;
const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });
const NOT_FOUND = err("Not found", "NOT_FOUND");
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

function db() {
  return getSupabaseAdmin();
}

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

/** Where a shared page lives. utm_source=share marks visits that came from a shared link. */
export function pageShareUrl(token: string): string {
  return `${clientOrigin()}/p/${token}?utm_source=share&utm_medium=page_link`;
}

function shareFromRow(row: Row): PageShare {
  return {
    url: pageShareUrl(row.token as string),
    revisionId: row.revision_id as string,
    createdAt: row.created_at as string,
  };
}

/** Only the album owner, or whoever uploaded the photo, may share its page. */
async function shareablePhoto(userId: string, photoId: string): Promise<ApiResult<Row>> {
  try {
    const found = await photoAccess(userId, photoId);
    if (!found) return NOT_FOUND;
    if (found.access.role !== "owner" && found.row.uploaded_by !== userId) return NOT_FOUND;
    return { data: found.row, error: null };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not check page access");
  }
}

async function liveShare(userId: string, photoId: string): Promise<Row | null> {
  const { data, error } = await db()
    .from("page_shares")
    .select("*")
    .eq("photo_id", photoId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPageShare(userId: string, photoId: string): Promise<ApiResult<PageShare | null>> {
  const photo = await shareablePhoto(userId, photoId);
  if (photo.error) return photo;
  try {
    const row = await liveShare(userId, photoId);
    return { data: row ? shareFromRow(row) : null, error: null };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not read the link");
  }
}

/** Share a page, or point the live link at another version of the same page's sheet. */
export async function sharePage(userId: string, photoId: string, revisionId: string): Promise<ApiResult<PageShare>> {
  const photo = await shareablePhoto(userId, photoId);
  if (photo.error) return photo;

  const { data: revision, error: revError } = await db()
    .from("library_sheet_revisions")
    .select("id, photo_id, kind")
    .eq("id", revisionId)
    .maybeSingle();
  if (revError) return err(revError.message);
  // A "photo" revision is an AI portrait of the photo itself; only coloring pages are shared.
  if (!revision || revision.photo_id !== photoId || revision.kind === "photo") {
    return err("Pick a coloring page to share.", "INVALID_REVISION");
  }

  try {
    const existing = await liveShare(userId, photoId);
    if (existing) {
      if (existing.revision_id === revisionId) return { data: shareFromRow(existing), error: null };
      const { data, error } = await db()
        .from("page_shares")
        .update({ revision_id: revisionId })
        .eq("id", existing.id as string)
        .select("*")
        .single();
      if (error || !data) return err(error?.message ?? "Could not update the link");
      return { data: shareFromRow(data), error: null };
    }

    const { data, error } = await db()
      .from("page_shares")
      .insert({
        token: randomBytes(18).toString("base64url"),
        user_id: userId,
        photo_id: photoId,
        revision_id: revisionId,
      })
      .select("*")
      .single();
    if (error || !data) return err(error?.message ?? "Could not create the link");
    log("info", "page share created", { userId, photoId });
    return { data: shareFromRow(data), error: null };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not create the link");
  }
}

export async function stopSharingPage(userId: string, photoId: string): Promise<ApiResult<{ revoked: boolean }>> {
  const photo = await shareablePhoto(userId, photoId);
  if (photo.error) return photo;
  const { data, error } = await db()
    .from("page_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("photo_id", photoId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  if (error) return err(error.message);
  if (data.length > 0) log("info", "page share revoked", { userId, photoId });
  return { data: { revoked: data.length > 0 }, error: null };
}

/** Deliberately no title: a sheet's title can name the people in the photo. */
export type SharedPage = { token: string; storagePath: string; mimeType: string };

/**
 * The page behind a public link, or null when the link is unknown, revoked, or its owner can
 * no longer see the page. Public: callers must not pass anything from here but the image.
 */
export async function findSharedPage(token: string): Promise<SharedPage | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const { data: share, error } = await db()
    .from("page_shares")
    .select("token, user_id, photo_id, revision_id, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!share || share.revoked_at) return null;

  const { data: revision, error: revError } = await db()
    .from("library_sheet_revisions")
    .select("photo_id, storage_path, mime_type, kind")
    .eq("id", share.revision_id as string)
    .maybeSingle();
  if (revError) throw new Error(revError.message);
  if (!revision || revision.photo_id !== share.photo_id || revision.kind === "photo") return null;

  // Someone removed from an album stops sharing its pages too.
  const access = await photoAccess(share.user_id as string, share.photo_id as string);
  if (!access) return null;

  return {
    token,
    storagePath: revision.storage_path as string,
    mimeType: revision.mime_type as string,
  };
}

export async function loadSharedPageImage(token: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const page = await findSharedPage(token);
  if (!page) return null;
  try {
    const obj = await getObjectBytes(page.storagePath);
    return { bytes: obj.bytes, mime: obj.mime || page.mimeType };
  } catch {
    return null;
  }
}
