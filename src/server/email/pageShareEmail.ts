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

/**
 * One coloring page someone shared by email: a preview, a link to open and print it, and an
 * invitation to create a free account and make their own. No attachment; the link is the page.
 */
export function pageShareEmail(input: {
  to: string;
  senderName: string;
  /** Optional personal message from the sender. */
  note: string;
  /** The shared page (/p/<token>). */
  pageUrl: string;
  /** The page image, for the preview. */
  imageUrl: string;
  signUpUrl: string;
  signInUrl: string;
}): OutgoingEmail {
  const senderName = oneLine(input.senderName) || "Someone";
  const sender = escapeHtml(senderName);
  const note = input.note.trim();
  const pageUrl = escapeHtml(input.pageUrl);
  const imageUrl = escapeHtml(input.imageUrl);
  const signUpUrl = escapeHtml(input.signUpUrl);
  const signInUrl = escapeHtml(input.signInUrl);

  const subject = `${senderName} sent you a coloring page`;
  const noteHtml = note
    ? `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #7446f0;background:#f7f5ff;color:#1f2937;white-space:pre-wrap;">${escapeHtml(note)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a101a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">A coloring page for you</p>
                <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:700;color:#0a101a;">From ${sender}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                ${noteHtml}
                <p style="margin:0 0 16px;">${sender} turned a family photo into a coloring page for you. Open it to print as many copies as you like.</p>
                <a href="${pageUrl}" style="display:block;text-decoration:none;">
                  <img src="${imageUrl}" alt="The coloring page" width="456" style="display:block;width:100%;max-width:456px;height:auto;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;" />
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px;">
                <a href="${pageUrl}" style="display:inline-block;background:#7446f0;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 24px;border-radius:999px;">Open and print your page</a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;">
                <div style="border-top:1px solid #e5e7eb;padding-top:20px;font-size:15px;line-height:1.55;color:#1f2937;">
                  <p style="margin:0 0 6px;font-weight:700;">Make pages from your own photos</p>
                  <p style="margin:0 0 14px;color:#475569;">Create a free account to turn your photos into coloring pages and printed coloring books.</p>
                  <a href="${signUpUrl}" style="display:inline-block;border:2px solid #7446f0;color:#5b34d6;text-decoration:none;font-weight:600;font-size:15px;padding:10px 20px;border-radius:999px;">Create a free account</a>
                  <p style="margin:12px 0 0;font-size:13px;color:#64748b;">Already have one? <a href="${signInUrl}" style="color:#5b34d6;">Sign in</a></p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px;font-size:13px;line-height:1.5;color:#64748b;">
                <p style="margin:0;">Colorful Memories turns everyday photos into coloring pages and printed coloring books.</p>
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
    `A coloring page from ${senderName}`,
    "",
    ...(note ? [note, ""] : []),
    `${senderName} turned a family photo into a coloring page for you. Open it to print as many copies as you like:`,
    input.pageUrl,
    "",
    "Make pages from your own photos. Create a free account:",
    input.signUpUrl,
    "",
    `Already have one? Sign in: ${input.signInUrl}`,
    "",
    `Sent because ${senderName} entered your email address.`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}
