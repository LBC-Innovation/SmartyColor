import "server-only";
import type { ApiResult } from "@/lib/api/types";
import type { AuthUser } from "@/lib/auth/authenticate";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import type { PageShare } from "@/lib/library/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { recordActivity } from "@/server/activityService";
import { pageShareEmail } from "@/server/email/pageShareEmail";
import { emailConfigured, sendEmail } from "@/server/email/resend";
import { senderDisplayName } from "@/server/familySendService";
import { normalizeEmail } from "@/server/libraryAccess";
import { sharePage } from "@/server/pageSharesService";
import { referralCodeFor } from "@/server/referralService";

const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Emails to other people are the spam risk here, so they are capped per account per day. */
const MAX_PAGE_EMAILS_PER_DAY = 20;
const MAX_NOTE_LENGTH = 500;
/** Where the email's sign-up and sign-in links send a new person: straight to the studio. */
const AFTER_SIGN_UP = "/studio";

async function pageEmailsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await getSupabaseAdmin()
    .from("account_activity")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "page_emailed")
    .gte("occurred_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** /p/<token>?utm… → /p/<token>/image (the preview in the email). */
function imageUrlFor(pageUrl: string): string {
  const url = new URL(pageUrl);
  url.search = "";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/image`;
  return url.toString();
}

function authUrl(path: "/sign-up" | "/sign-in", refCode: string | null): string {
  const params = new URLSearchParams({
    next: AFTER_SIGN_UP,
    utm_source: "share",
    utm_medium: "email",
    utm_campaign: "shared_page",
  });
  if (refCode) params.set("ref", refCode);
  return `${clientOrigin()}${path}?${params.toString()}`;
}

/**
 * Email one coloring page to someone: turns its share link on (or reuses it), then sends the
 * link with an invitation to create a free account. Signed-in only, like page sharing itself.
 */
export async function emailPageShare(input: {
  user: AuthUser;
  photoId: string;
  revisionId: string;
  email: string;
  note: string;
}): Promise<ApiResult<{ share: PageShare }>> {
  const { user, photoId, revisionId } = input;
  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return err("Enter a valid email address.", "INVALID_EMAIL");
  const note = input.note.trim().slice(0, MAX_NOTE_LENGTH);
  if (process.env.NODE_ENV === "production" && !emailConfigured()) {
    return err("Email isn't available right now. Please try again later.", "UNAVAILABLE");
  }

  try {
    if ((await pageEmailsToday(user.id)) >= MAX_PAGE_EMAILS_PER_DAY) {
      return err("You've emailed a lot of pages today. Please try again tomorrow.", "LIMIT");
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not check today's emails");
  }

  const shared = await sharePage(user.id, photoId, revisionId);
  if (shared.error) return shared;
  const share = shared.data!;
  const refCode = await referralCodeFor(user.id);

  const sent = await sendEmail(
    pageShareEmail({
      to: email,
      senderName: await senderDisplayName(user),
      note,
      pageUrl: share.url,
      imageUrl: imageUrlFor(share.url),
      signUpUrl: authUrl("/sign-up", refCode),
      signInUrl: authUrl("/sign-in", refCode),
    }),
  );
  if (!sent) return err("The email couldn't be sent. Please try again.", "SEND_FAILED");

  await recordActivity({
    userId: user.id,
    category: "sheets",
    type: "page_emailed",
    description: `Emailed a coloring page to ${email}`,
    referenceType: "library_photo",
    referenceId: photoId,
  });
  console.log(JSON.stringify({ level: "info", message: "page share emailed", userId: user.id, photoId }));
  return { data: { share }, error: null };
}
