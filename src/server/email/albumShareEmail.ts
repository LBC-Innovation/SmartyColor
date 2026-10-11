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
 * The album name leads the subject and the body so the recipient can tell at a
 * glance what the message is about. Existing members get a link straight to the
 * album; everyone else is asked whether they'd like to join and sign up.
 */
export function albumShareEmail(input: {
  to: string;
  albumName: string;
  inviterName: string;
  /** True when the recipient already has an account and the album is in their list. */
  existingUser: boolean;
  url: string;
}): OutgoingEmail {
  const albumName = oneLine(input.albumName) || "an album";
  const inviterName = oneLine(input.inviterName) || "Someone";
  const album = escapeHtml(albumName);
  const inviter = escapeHtml(inviterName);
  const url = escapeHtml(input.url);

  const subject = input.existingUser
    ? `“${albumName}”: ${inviterName} shared this album with you`
    : `“${albumName}”: ${inviterName} invited you to add photos`;
  const lead = input.existingUser
    ? `${inviter} shared an album with you on ColorfulMemories. It is already in your album list, ready for your photos.`
    : `${inviter} would like you to join their album on ColorfulMemories and add your own photos to it. Would you like to join?`;
  const detail = input.existingUser
    ? "Open it to see the photos so far, add yours, and turn any of them into coloring pages."
    : "Create a free account with this email address and the album will be waiting for you. If you'd rather not, you can ignore this message.";
  const cta = input.existingUser ? "Open the album" : "Join and create your account";

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a101a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Shared album</p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:700;color:#0a101a;">${album}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                <p style="margin:0 0 12px;">${lead}</p>
                <p style="margin:0;color:#475569;">${detail}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px;">
                <a href="${url}" style="display:inline-block;background:#564fd0;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 24px;border-radius:999px;">${cta}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px;font-size:13px;line-height:1.5;color:#64748b;">
                <p style="margin:0;">Or paste this link into your browser:<br /><a href="${url}" style="color:#564fd0;word-break:break-all;">${url}</a></p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">ColorfulMemories · Sent because ${inviter} entered your email address.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Shared album: ${albumName}`,
    "",
    input.existingUser
      ? `${inviterName} shared an album with you on ColorfulMemories. It is already in your album list, ready for your photos.`
      : `${inviterName} would like you to join their album on ColorfulMemories and add your own photos to it. Would you like to join?`,
    "",
    detail,
    "",
    `${cta}: ${input.url}`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}
