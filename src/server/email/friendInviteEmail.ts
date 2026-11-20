import "server-only";
import type { OutgoingEmail } from "@/server/email/resend";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Header values must stay on one line. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * Share with a friend, by email: who sent it, what Colorful Memories is in a sentence, the credit
 * waiting for them, and one button to the friend landing page (which carries the sharer's code).
 */
export function friendInviteEmail(input: {
  to: string;
  senderName: string;
  /** Optional personal message from the sender. */
  note: string;
  /** The friend landing page link, tagged utm_content=email. */
  url: string;
  /** What the friend gets on sign-up; 0 leaves the credit out. */
  friendCreditCents: number;
}): OutgoingEmail {
  const senderName = oneLine(input.senderName) || "A friend";
  const sender = escapeHtml(senderName);
  const note = input.note.trim();
  const url = escapeHtml(input.url);
  const credit = input.friendCreditCents > 0 ? usd(input.friendCreditCents) : null;

  const subject = credit
    ? `${senderName} sent you ${credit} for Colorful Memories`
    : `${senderName} thinks you'd love Colorful Memories`;
  const heading = credit ? `${escapeHtml(credit)} to get you started` : "Turn your photos into coloring pages";
  const noteHtml = note
    ? `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #7446f0;background:#f7f5ff;color:#1f2937;white-space:pre-wrap;">${escapeHtml(note)}</p>`
    : "";
  const creditLine = credit
    ? `Create a free account through ${sender}'s link and ${escapeHtml(credit)} of credit is yours to spend on pages and printed books.`
    : "Create a free account to make your first pages.";

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a101a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">From ${sender}</p>
                <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:700;color:#0a101a;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                ${noteHtml}
                <p style="margin:0 0 12px;">Colorful Memories turns your family photos into coloring pages and printed coloring books.</p>
                <p style="margin:0 0 12px;">${creditLine}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 32px;">
                <a href="${url}" style="display:inline-block;background:#7446f0;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 24px;border-radius:999px;">${credit ? `Claim your ${escapeHtml(credit)}` : "Get started"}</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Colorful Memories · Sent because ${sender} entered your email address.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    credit ? `${senderName} sent you ${credit} for Colorful Memories` : `${senderName} thinks you'd love Colorful Memories`,
    "",
    ...(note ? [note, ""] : []),
    "Colorful Memories turns your family photos into coloring pages and printed coloring books.",
    credit
      ? `Create a free account through ${senderName}'s link and ${credit} of credit is yours:`
      : "Create a free account to make your first pages:",
    input.url,
    "",
    `Sent because ${senderName} entered your email address.`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}
