import "server-only";
import { bundleLines, type PurchaseCodeBundle } from "@/lib/purchaseCodes/types";
import type { OutgoingEmail } from "@/server/email/resend";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

/** Sends someone a purchase code: what it includes and the link that redeems it. */
export function purchaseCodeEmail(input: {
  to: string;
  code: string;
  campaign: string;
  recipientName: string | null;
  note: string | null;
  bundle: PurchaseCodeBundle;
  expiresAt: string | null;
  url: string;
}): OutgoingEmail {
  const lines = bundleLines(input.bundle);
  const note = input.note?.trim() ?? "";
  const greeting = input.recipientName?.trim() ? `Hi ${input.recipientName.trim()},` : "Hi,";
  const subject = "Your Colorful Memories coloring book is ready to make";
  const lead =
    "You've got a coloring book made from your own photos, already paid for. Use the code below to start: " +
    "upload your photos, we turn them into coloring pages, and we print and ship the book to you.";
  const expiry = input.expiresAt ? `Use it by ${longDate(input.expiresAt)}.` : "";
  const url = escapeHtml(input.url);

  const noteHtml = note
    ? `<tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ff;border-radius:12px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:15px;line-height:1.5;color:#1f2937;">
                      <p style="margin:0;white-space:pre-line;">${escapeHtml(note)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
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
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">${escapeHtml(input.campaign)}</p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:700;color:#0a101a;">Your coloring book is ready to make</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
                <p style="margin:0;">${lead}</p>
              </td>
            </tr>
            ${noteHtml}
            <tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed #c4b5fd;border-radius:12px;">
                  <tr>
                    <td align="center" style="padding:16px;">
                      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Your code</p>
                      <p style="margin:0;font-size:26px;font-weight:700;letter-spacing:0.12em;font-family:'SFMono-Regular',Menlo,Consolas,monospace;color:#0a101a;">${escapeHtml(input.code)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;font-size:15px;line-height:1.55;color:#1f2937;">
                <p style="margin:0 0 8px;font-weight:600;">What's included</p>
                <ul style="margin:0;padding:0 0 0 20px;color:#475569;">
                  ${lines.map((b) => `<li style="margin:0 0 6px;">${escapeHtml(b)}</li>`).join("\n                  ")}
                </ul>
                ${expiry ? `<p style="margin:12px 0 0;color:#475569;">${expiry}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px;">
                <a href="${url}" style="display:inline-block;background:#7446f0;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 24px;border-radius:999px;">Start my book</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Colorful Memories · Sent because someone gave you a coloring book code.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Your coloring book is ready to make",
    "",
    greeting,
    "",
    lead,
    ...(note ? ["", note] : []),
    "",
    `Your code: ${input.code}`,
    "",
    "What's included:",
    ...lines.map((b) => `- ${b}`),
    ...(expiry ? ["", expiry] : []),
    "",
    `Start my book: ${input.url}`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}
