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
 * Coloring pages someone sent to a relative (often a grandparent), with the printable PDF
 * attached. The recipient has no account, so the only link is an invitation to make their own.
 */
export function familyPagesEmail(input: {
  to: string;
  senderName: string;
  pageCount: number;
  /** Optional personal message from the sender. */
  note: string;
  makeYourOwnUrl: string;
  pdf: Uint8Array;
}): OutgoingEmail {
  const senderName = oneLine(input.senderName) || "Someone";
  const sender = escapeHtml(senderName);
  const pages = input.pageCount === 1 ? "a coloring page" : `${input.pageCount} coloring pages`;
  const note = input.note.trim();
  const url = escapeHtml(input.makeYourOwnUrl);

  const subject = `${senderName} sent you ${pages} to print and color`;
  const lead = `${sender} turned family photos into ${pages} for you. They're attached as a PDF, ready to print on regular paper.`;
  const noteHtml = note
    ? `<p style="margin:0 0 12px;padding:12px 16px;border-left:3px solid #7446f0;background:#f7f5ff;color:#1f2937;white-space:pre-wrap;">${escapeHtml(note)}</p>`
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
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Coloring pages for you</p>
                <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:700;color:#0a101a;">From ${sender}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                ${noteHtml}
                <p style="margin:0 0 12px;">${lead}</p>
                <p style="margin:0;color:#475569;">Open the attachment and print as many copies as you like.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px;">
                <a href="${url}" style="display:inline-block;background:#7446f0;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 24px;border-radius:999px;">Make your own from your photos</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px;font-size:13px;line-height:1.5;color:#64748b;">
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
    `Coloring pages from ${senderName}`,
    "",
    ...(note ? [note, ""] : []),
    `${senderName} turned family photos into ${pages} for you. They're attached as a PDF, ready to print on regular paper.`,
    "",
    `Make your own from your photos: ${input.makeYourOwnUrl}`,
    "",
    `Sent because ${senderName} entered your email address.`,
  ].join("\n");

  return {
    to: input.to,
    subject,
    html,
    text,
    attachments: [{ filename: "coloring-pages.pdf", content: input.pdf }],
  };
}
