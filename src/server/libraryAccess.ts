import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import type { LibraryProjectRole } from "@/lib/library/types";

type Row = Record<string, unknown>;

/**
 * Who may touch an album. Photos, revisions and files stay keyed on the album
 * owner's id, so callers resolve access here and then work with `ownerId`.
 */
export type ProjectAccess = {
  project: Row;
  ownerId: string;
  role: LibraryProjectRole;
  /** The caller's share row when they are a contributor. */
  share: Row | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function projectAccess(actorId: string, projectId: string): Promise<ProjectAccess | null> {
  const db = getSupabaseAdmin();
  const { data: project, error } = await db
    .from("library_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!project) return null;
  const ownerId = project.user_id as string;
  if (ownerId === actorId) return { project, ownerId, role: "owner", share: null };

  const { data: share, error: sErr } = await db
    .from("library_project_shares")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", actorId)
    .eq("status", "active")
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!share) return null;
  return { project, ownerId, role: "contributor", share };
}

export async function photoAccess(
  actorId: string,
  photoId: string,
): Promise<{ row: Row; access: ProjectAccess } | null> {
  const { data: row, error } = await getSupabaseAdmin()
    .from("library_photos")
    .select("*")
    .eq("id", photoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const access = await projectAccess(actorId, row.project_id as string);
  if (!access) return null;
  return { row, access };
}

/**
 * Turn invites sent to this address before the account existed into memberships.
 * Only call with an address the auth provider has verified.
 */
export async function claimPendingShares(userId: string, verifiedEmail: string): Promise<void> {
  const email = normalizeEmail(verifiedEmail);
  if (!email) return;
  const { error } = await getSupabaseAdmin()
    .from("library_project_shares")
    .update({ user_id: userId, status: "active", accepted_at: new Date().toISOString() })
    .eq("email", email)
    .eq("status", "pending");
  if (error) {
    console.error(JSON.stringify({ level: "warn", message: "library: claiming shares failed", userId, error: error.message }));
  }
}
