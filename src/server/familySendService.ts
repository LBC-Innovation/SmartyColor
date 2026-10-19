import "server-only";
import type { ApiResult } from "@/lib/api/types";
import type { AuthUser } from "@/lib/auth/authenticate";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import type { DigitalBookPage } from "@/lib/orders/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { recordActivity } from "@/server/activityService";
import { buildPdf } from "@/server/digitalBookService";
import { familyPagesEmail } from "@/server/email/familyPagesEmail";
import { emailConfigured, sendEmail } from "@/server/email/resend";
import { normalizeEmail, projectAccess } from "@/server/libraryAccess";
import { compactGraySheet } from "@/server/printBookService";

/**
 * "Send pages to family": email an album's coloring pages as one printable PDF to an address
 * the signed-in user enters. Guests never reach this (the no-account promise: trying the app
 * without an account uploads nothing), and the API requires a session.
 */

type Row = Record<string, unknown>;
const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Keeps the attachment well under Resend's 40 MB and the build quick. */
export const MAX_SEND_PAGES = 40;
const MAX_SENDS_PER_DAY = 10;
const MAX_NOTE_LENGTH = 500;
/** 150 PPI on an 11-inch page: plenty for a home printer, small enough to email. */
const SHEET_MAX_PX = 1650;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

function db() {
  return getSupabaseAdmin();
}

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

async function displayName(user: Pick<AuthUser, "id" | "email">): Promise<string> {
  const { data } = await db().from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return (data?.display_name as string | null)?.trim() || user.email.split("@")[0] || "Someone";
}

/** Each photo's coloring page in album order: its active version, or its newest sheet. */
async function albumPages(projectId: string): Promise<ApiResult<DigitalBookPage[]>> {
  const { data: photos, error } = await db()
    .from("library_photos")
    .select("id, active_revision_id")
    .eq("project_id", projectId)
    .order("position", { ascending: true });
  if (error) return err(error.message);
  if (!photos?.length) return { data: [], error: null };

  const { data: revisions, error: revError } = await db()
    .from("library_sheet_revisions")
    .select("id, photo_id, kind, created_at")
    .in(
      "photo_id",
      photos.map((p) => p.id as string),
    )
    .order("created_at", { ascending: false });
  if (revError) return err(revError.message);

  const sheetsByPhoto = new Map<string, Row[]>();
  for (const rev of revisions ?? []) {
    if (rev.kind === "photo") continue;
    const list = sheetsByPhoto.get(rev.photo_id as string) ?? [];
    list.push(rev);
    sheetsByPhoto.set(rev.photo_id as string, list);
  }

  const pages: DigitalBookPage[] = [];
  for (const photo of photos) {
    const sheets = sheetsByPhoto.get(photo.id as string);
    if (!sheets?.length) continue;
    const active = sheets.find((s) => s.id === photo.active_revision_id) ?? sheets[0];
    pages.push({ kind: "photo", revisionId: active.id as string, rotation: 0, mirrored: false });
  }
  return { data: pages, error: null };
}

async function sendsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await db()
    .from("account_activity")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "album_sent")
    .gte("occurred_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function sendAlbumToFamily(input: {
  user: AuthUser;
  projectId: string;
  email: string;
  note: string;
}): Promise<ApiResult<{ pageCount: number }>> {
  const { user, projectId } = input;
  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return err("Enter a valid email address.", "INVALID_EMAIL");
  const note = input.note.trim().slice(0, MAX_NOTE_LENGTH);
  if (process.env.NODE_ENV === "production" && !emailConfigured()) {
    return err("Email isn't available right now. Please try again later.", "UNAVAILABLE");
  }

  let project: Row;
  try {
    const access = await projectAccess(user.id, projectId);
    if (!access) return err("Not found", "NOT_FOUND");
    project = access.project;
    if ((await sendsToday(user.id)) >= MAX_SENDS_PER_DAY) {
      return err("You've sent a lot of pages today. Please try again tomorrow.", "LIMIT");
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not check the album");
  }

  const found = await albumPages(projectId);
  if (found.error) return found;
  const pages = found.data!.slice(0, MAX_SEND_PAGES);
  if (pages.length === 0) return err("Make a coloring page in this album first.", "NO_PAGES");

  const pdf = await buildPdf(user.id, pages, {
    prepareSheet: (dataUrl) => compactGraySheet(dataUrl, SHEET_MAX_PX),
  });
  if (pdf.error) return pdf;
  if (pdf.data!.byteLength > MAX_PDF_BYTES) {
    return err("These pages are too large to email together. Try an album with fewer pages.", "TOO_LARGE");
  }

  const sent = await sendEmail(
    familyPagesEmail({
      to: email,
      senderName: await displayName(user),
      pageCount: pages.length,
      note,
      makeYourOwnUrl: `${clientOrigin()}/?utm_source=family_email&utm_medium=email&utm_campaign=send_to_family`,
      pdf: pdf.data!,
    }),
  );
  if (!sent) return err("The email couldn't be sent. Please try again.", "SEND_FAILED");

  const pageWord = pages.length === 1 ? "1 coloring page" : `${pages.length} coloring pages`;
  const albumName = ((project.name as string | null) ?? "").trim();
  await recordActivity({
    userId: user.id,
    category: "albums",
    type: "album_sent",
    description: albumName ? `Emailed ${pageWord} from “${albumName}” to ${email}` : `Emailed ${pageWord} to ${email}`,
    referenceType: "library_project",
    referenceId: projectId,
    metadata: { pageCount: pages.length, pdfBytes: pdf.data!.byteLength },
  });
  log("info", "album pages emailed", { userId: user.id, projectId, pageCount: pages.length, pdfBytes: pdf.data!.byteLength });
  return { data: { pageCount: pages.length }, error: null };
}
