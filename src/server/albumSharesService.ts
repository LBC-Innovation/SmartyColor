import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import type { ApiResult } from "@/lib/api/types";
import type { AuthUser } from "@/lib/auth/authenticate";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import type { AlbumInvitePreview, AlbumShare } from "@/lib/library/types";
import { albumShareEmail } from "@/server/email/albumShareEmail";
import { referralCodeFor, withShareTags } from "@/server/referralService";
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
  return {
    id: row.id as string,
    email: (row.email as string | null) ?? null,
    via: row.invited_via === "link" ? "link" : "email",
    joined: row.status === "active",
    invitedAt: row.created_at as string,
  };
}

/**
 * Where an invite link points. Signed-in people join from there; everyone else signs up first.
 * Tagged as an album invite, with the inviter's referral code so a new account counts as theirs.
 */
export function inviteLinkUrl(shareId: string, refCode: string | null = null): string {
  return withShareTags(`${clientOrigin()}/join/${encodeURIComponent(shareId)}`, {
    utm_source: "album_invite",
    utm_medium: "invite_link",
    utm_campaign: "album_share",
    ref: refCode,
  });
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
    : withShareTags(`${origin}/sign-up?invite=${encodeURIComponent(share.id as string)}`, {
        utm_source: "album_invite",
        utm_medium: "email",
        utm_campaign: "album_share",
        ref: await referralCodeFor(project.user_id as string),
      });
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
    .select("id, email, invited_via, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) return err(error.message);
  return { data: (data ?? []).map(shareFromRow), error: null };
}

/** Shared by email and link invites: per-album and per-day caps, and no duplicate addresses. */
async function checkInviteLimits(userId: string, projectId: string, email: string | null): Promise<ApiResult<true>> {
  const { data: existing, error: eErr } = await db()
    .from("library_project_shares")
    .select("id, email")
    .eq("project_id", projectId);
  if (eErr) return err(eErr.message);
  if (email && (existing ?? []).some((s) => s.email === email)) {
    return err("This album has already been shared with that address.", "ALREADY_SHARED");
  }
  if ((existing ?? []).length >= MAX_SHARES_PER_ALBUM) {
    return err(`An album can be shared with up to ${MAX_SHARES_PER_ALBUM} people.`, "LIMIT");
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recent } = await db()
    .from("library_project_shares")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", userId)
    .gte("created_at", dayAgo);
  if ((recent ?? 0) >= MAX_INVITES_PER_DAY) {
    return err("You've sent a lot of invitations today. Try again tomorrow.", "LIMIT");
  }
  return { data: true, error: null };
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

  const limits = await checkInviteLimits(user.id, projectId, email);
  if (limits.error) return limits;

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
  if (!share.email) return err("This invite was sent as a link. Copy the link and send it again.", "NO_EMAIL");

  const last = share.last_emailed_at ? Date.parse(share.last_emailed_at as string) : 0;
  if (Date.now() - last < RESEND_COOLDOWN_MS) {
    return err("That invitation was just sent. Give it a minute before sending again.", "TOO_SOON");
  }
  const emailSent = await sendShareEmail(share, project.data!, await displayName(user));
  if (!emailSent) return err("The email could not be sent. Try again shortly.", "EMAIL_FAILED");
  return { data: { emailSent }, error: null };
}

/**
 * Invite by text message or any other app: a single-use link with no email attached. The
 * person who opens it signs in (or signs up) and joins with whatever address they use.
 */
export async function createInviteLink(
  user: AuthUser,
  projectId: string,
): Promise<ApiResult<{ share: AlbumShare; url: string; inviterName: string; albumName: string }>> {
  const project = await ownedProject(user.id, projectId);
  if (project.error) return project;
  const limits = await checkInviteLimits(user.id, projectId, null);
  if (limits.error) return limits;

  const { data: share, error } = await db()
    .from("library_project_shares")
    .insert({
      project_id: projectId,
      email: null,
      invited_via: "link",
      invited_by: user.id,
      user_id: null,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) return err(error.message);
  return {
    data: {
      share: shareFromRow(share),
      url: inviteLinkUrl(share.id as string, await referralCodeFor(user.id)),
      inviterName: await displayName(user),
      albumName: project.data!.name as string,
    },
    error: null,
  };
}

/**
 * The signed-in person opening an invite link joins the album. Link invites are claimed by
 * whoever opens them first; an email invite only by the account with that address.
 */
export async function acceptInvite(
  user: AuthUser,
  shareId: string,
): Promise<ApiResult<{ albumId: string }>> {
  if (!UUID_PATTERN.test(shareId)) return NOT_FOUND;
  const { data: share, error } = await db()
    .from("library_project_shares")
    .select("*")
    .eq("id", shareId)
    .maybeSingle();
  if (error) return err(error.message);
  if (!share) return NOT_FOUND;
  const albumId = share.project_id as string;
  const joined = { data: { albumId }, error: null };

  const { data: project, error: pErr } = await db()
    .from("library_projects")
    .select("id, user_id")
    .eq("id", albumId)
    .maybeSingle();
  if (pErr) return err(pErr.message);
  if (!project) return NOT_FOUND;
  if (project.user_id === user.id) return err("This is your own album, so you already have it.", "OWN_ALBUM");

  if (share.user_id === user.id) return joined;
  if (share.user_id) {
    return err("This invite link has already been used. Ask for a new one.", "ALREADY_USED");
  }

  const email = user.emailVerified ? normalizeEmail(user.email) : "";
  if (share.invited_via !== "link") {
    // Email invites belong to the address they were sent to.
    if (!email || share.email !== email) {
      return err(
        `This invitation was sent to ${share.email as string}. Sign in with that address to join.`,
        "WRONG_ACCOUNT",
      );
    }
  }

  // Already in the album some other way (an earlier link, or an email invite to this address)?
  const [byUser, byEmail] = await Promise.all([
    db().from("library_project_shares").select("id, status").eq("project_id", albumId).neq("id", shareId).eq("user_id", user.id),
    email
      ? db().from("library_project_shares").select("id, status").eq("project_id", albumId).neq("id", shareId).eq("email", email)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  if (byUser.error) return err(byUser.error.message);
  if (byEmail.error) return err(byEmail.error.message);
  const now = new Date().toISOString();
  const existing = [...(byUser.data ?? []), ...(byEmail.data ?? [])][0];
  if (existing) {
    if (existing.status !== "active") {
      const { error: aErr } = await db()
        .from("library_project_shares")
        .update({ user_id: user.id, status: "active", accepted_at: now })
        .eq("id", existing.id as string);
      if (aErr) return err(aErr.message);
    }
    // The spare link is removed so it doesn't count against the album's limit.
    if (share.invited_via === "link") {
      await db().from("library_project_shares").delete().eq("id", shareId).is("user_id", null);
    }
    return joined;
  }

  // `user_id is null` keeps two people from claiming the same link at once.
  const { data: claimed, error: cErr } = await db()
    .from("library_project_shares")
    .update({
      user_id: user.id,
      ...(share.invited_via === "link" && email ? { email } : {}),
      status: "active",
      accepted_at: now,
    })
    .eq("id", shareId)
    .is("user_id", null)
    .select("id")
    .maybeSingle();
  if (cErr) {
    // Someone added this address while we were looking; they're in either way.
    if (cErr.code === "23505") {
      await db().from("library_project_shares").update({ user_id: user.id, status: "active", accepted_at: now }).eq("id", shareId).is("user_id", null);
      return joined;
    }
    return err(cErr.message);
  }
  if (!claimed) return err("This invite link has already been used. Ask for a new one.", "ALREADY_USED");
  return joined;
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
    .select("id, email, project_id, invited_by, user_id, invited_via")
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
      // A link's email, once claimed, is the joiner's own: never show it to others holding the link.
      email: share.invited_via === "link" ? null : ((share.email as string | null) ?? null),
      used: share.invited_via === "link" && Boolean(share.user_id),
    },
    error: null,
  };
}
