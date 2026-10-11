import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import type { ApiResult } from "@/lib/api/types";
import type { AuthUser } from "@/lib/auth/authenticate";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import type { AlbumInvitePreview, AlbumShare } from "@/lib/library/types";
import { albumShareEmail } from "@/server/email/albumShareEmail";
import { sendEmail } from "@/server/email/resend";
import { normalizeEmail, projectAccess } from "@/server/libraryAccess";

type Row = Record<string, unknown>;
const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });
const NOT_FOUND = err("Not found", "NOT_FOUND");

export const MAX_SHARES_PER_ALBUM = 20;
const MAX_INVITES_PER_DAY = 50;
const RESEND_COOLDOWN_MS = 60_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function db() {
  return getSupabaseAdmin();
}

/** The owner's view of an invite never reveals whether the invitee has an account. */
function shareFromRow(row: Row): AlbumShare {
  return { id: row.id as string, email: row.email as string, invitedAt: row.created_at as string };
}

async function ownedProject(userId: string, projectId: string): Promise<ApiResult<Row>> {
  try {
    const access = await projectAccess(userId, projectId);
    if (!access || access.role !== "owner") return NOT_FOUND;
    return { data: access.project, error: null };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not check album access");
  }
}

async function displayName(user: Pick<AuthUser, "id" | "email">): Promise<string> {
  const { data } = await db().from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return (data?.display_name as string | null)?.trim() || user.email.split("@")[0] || "Someone";
}

async function sendShareEmail(share: Row, project: Row, inviterName: string): Promise<boolean> {
  const existingUser = share.status === "active";
  const origin = clientOrigin();
  const url = existingUser
    ? `${origin}/studio?album=${encodeURIComponent(project.id as string)}`
    : `${origin}/sign-up?invite=${encodeURIComponent(share.id as string)}`;
  const sent = await sendEmail(
    albumShareEmail({
      to: share.email as string,
      albumName: project.name as string,
      inviterName,
      existingUser,
      url,
    }),
  );
  if (sent) {
    await db()
      .from("library_project_shares")
      .update({ last_emailed_at: new Date().toISOString() })
      .eq("id", share.id as string);
  }
  return sent;
}

export async function listShares(userId: string, projectId: string): Promise<ApiResult<AlbumShare[]>> {
  const project = await ownedProject(userId, projectId);
  if (project.error) return project;
  const { data, error } = await db()
    .from("library_project_shares")
    .select("id, email, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) return err(error.message);
  return { data: (data ?? []).map(shareFromRow), error: null };
}

export async function inviteToAlbum(
  user: AuthUser,
  projectId: string,
  rawEmail: string,
): Promise<ApiResult<{ share: AlbumShare; emailSent: boolean }>> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return err("Enter a valid email address.", "INVALID_EMAIL");
  if (email === normalizeEmail(user.email)) return err("That's your own email address.", "INVALID_EMAIL");

  const project = await ownedProject(user.id, projectId);
  if (project.error) return project;

  const { data: existing, error: eErr } = await db()
    .from("library_project_shares")
    .select("id, email")
    .eq("project_id", projectId);
  if (eErr) return err(eErr.message);
  if ((existing ?? []).some((s) => s.email === email)) {
    return err("This album has already been shared with that address.", "ALREADY_SHARED");
  }
  if ((existing ?? []).length >= MAX_SHARES_PER_ALBUM) {
    return err(`An album can be shared with up to ${MAX_SHARES_PER_ALBUM} people.`, "LIMIT");
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recent } = await db()
    .from("library_project_shares")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", user.id)
    .gte("created_at", dayAgo);
  if ((recent ?? 0) >= MAX_INVITES_PER_DAY) {
    return err("You've sent a lot of invitations today. Try again tomorrow.", "LIMIT");
  }

  // People who already have a verified account join straight away; everyone else
  // is picked up the first time they sign in with this address.
  const { data: inviteeId, error: lookupError } = await db().rpc("verified_user_id_by_email", { p_email: email });
  if (lookupError) return err(lookupError.message);
  const memberId = typeof inviteeId === "string" ? inviteeId : null;

  const { data: share, error } = await db()
    .from("library_project_shares")
    .insert({
      project_id: projectId,
      email,
      invited_by: user.id,
      user_id: memberId,
      status: memberId ? "active" : "pending",
      accepted_at: memberId ? new Date().toISOString() : null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return err("This album has already been shared with that address.", "ALREADY_SHARED");
    return err(error.message);
  }

  const emailSent = await sendShareEmail(share, project.data!, await displayName(user));
  return { data: { share: shareFromRow(share), emailSent }, error: null };
}

export async function resendShare(
  user: AuthUser,
  projectId: string,
  shareId: string,
): Promise<ApiResult<{ emailSent: boolean }>> {
  const project = await ownedProject(user.id, projectId);
  if (project.error) return project;
  if (!UUID_PATTERN.test(shareId)) return NOT_FOUND;
  const { data: share, error } = await db()
    .from("library_project_shares")
    .select("*")
    .eq("id", shareId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return err(error.message);
  if (!share) return NOT_FOUND;

  const last = share.last_emailed_at ? Date.parse(share.last_emailed_at as string) : 0;
  if (Date.now() - last < RESEND_COOLDOWN_MS) {
    return err("That invitation was just sent. Give it a minute before sending again.", "TOO_SOON");
  }
  const emailSent = await sendShareEmail(share, project.data!, await displayName(user));
  if (!emailSent) return err("The email could not be sent. Try again shortly.", "EMAIL_FAILED");
  return { data: { emailSent }, error: null };
}

/** The owner removes someone, or a contributor leaves (`shareId` = "me"). Their photos stay in the album. */
export async function removeShare(
  userId: string,
  projectId: string,
  shareId: string,
): Promise<ApiResult<{ id: string }>> {
  if (shareId === "me") {
    const { data, error } = await db()
      .from("library_project_shares")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return NOT_FOUND;
    return { data: { id: data.id as string }, error: null };
  }

  const project = await ownedProject(userId, projectId);
  if (project.error) return project;
  if (!UUID_PATTERN.test(shareId)) return NOT_FOUND;
  const { data, error } = await db()
    .from("library_project_shares")
    .delete()
    .eq("id", shareId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();
  if (error) return err(error.message);
  if (!data) return NOT_FOUND;
  return { data: { id: data.id as string }, error: null };
}

/** Public: lets the sign-up page say which album an invite link is for. */
export async function getInvitePreview(shareId: string): Promise<ApiResult<AlbumInvitePreview>> {
  if (!UUID_PATTERN.test(shareId)) return NOT_FOUND;
  const { data: share, error } = await db()
    .from("library_project_shares")
    .select("id, email, project_id, invited_by")
    .eq("id", shareId)
    .maybeSingle();
  if (error) return err(error.message);
  if (!share) return NOT_FOUND;
  const [{ data: project }, { data: inviter }] = await Promise.all([
    db().from("library_projects").select("id, name").eq("id", share.project_id as string).maybeSingle(),
    db().from("profiles").select("display_name").eq("id", share.invited_by as string).maybeSingle(),
  ]);
  if (!project) return NOT_FOUND;
  return {
    data: {
      albumId: project.id as string,
      albumName: project.name as string,
      inviterName: (inviter?.display_name as string | null)?.trim() || "Someone",
      email: share.email as string,
    },
    error: null,
  };
}
