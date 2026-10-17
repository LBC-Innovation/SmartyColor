import "server-only";
import { freeEditsPerSheet, unitPriceCents } from "@/lib/credits/pricing";
import type { PublicPriceList } from "@/lib/pricing/types";
import type { OutgoingEmail } from "@/server/email/resend";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Server-side money formatting with a fixed locale, so every recipient sees the same thing. */
function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * Tells a user that credit was added to their account: how much, what it is
 * good for, and the note the admin wrote for them (if any).
 */
export function creditGrantEmail(input: {
  to: string;
  amountCents: number;
  balanceCents: number;
  /** Shown to the recipient as written. */
  note?: string;
  url: string;
  /** Current customer prices; the email leaves amounts out when they couldn't be read. */
  prices: PublicPriceList | null;
}): OutgoingEmail {
  const amount = usd(input.amountCents);
  const balance = usd(input.balanceCents);
  const note = input.note?.trim() ?? "";
  const sheetCents = unitPriceCents(input.prices, "ai.sheet_generation");
  const digitalCents = unitPriceCents(input.prices, "book.digital");
  const freeEdits = freeEditsPerSheet(input.prices);
  const pages = sheetCents ? Math.floor(input.amountCents / sheetCents) : 0;
  const url = escapeHtml(input.url);

  const subject = `You've been given ${amount} in Colorful Memories credit`;
  const lead = `We've added ${amount} in credit to your Colorful Memories account. Your balance is now ${balance}.`;
  const benefits = [
    sheetCents
      ? `Turn your photos into coloring pages (${usd(sheetCents)} a page${
          pages >= 2 ? `, so this credit covers about ${pages} of them` : ""
        }).${freeEdits > 0 ? ` Each page comes with ${freeEdits} free touch-ups.` : ""}`
      : "Turn your photos into coloring pages.",
    digitalCents
      ? `Download a print-at-home book of your pages for ${usd(digitalCents)}.`
      : "Download a print-at-home book of your pages.",
    "Put it toward a printed coloring book delivered to your door.",
  ];
  const closing =
    "There's nothing to redeem. The credit is already in your account and is used automatically as you create.";
  const cta = "Start creating";

  const noteHtml = note
    ? `<tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ff;border-radius:12px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:15px;line-height:1.5;color:#1f2937;">
                      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">A note from us</p>
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
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Account credit</p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:700;color:#0a101a;">${amount} added to your account</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                <p style="margin:0;">${lead}</p>
              </td>
            </tr>
            ${noteHtml}
            <tr>
              <td style="padding:20px 32px 0;font-size:15px;line-height:1.55;color:#1f2937;">
                <p style="margin:0 0 8px;font-weight:600;">What you can do with it</p>
                <ul style="margin:0;padding:0 0 0 20px;color:#475569;">
                  ${benefits.map((b) => `<li style="margin:0 0 6px;">${b}</li>`).join("\n                  ")}
                </ul>
                <p style="margin:12px 0 0;color:#475569;">${closing}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px;">
                <a href="${url}" style="display:inline-block;background:#7446f0;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 24px;border-radius:999px;">${cta}</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Colorful Memories · Sent because credit was added to your account.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${amount} added to your account`,
    "",
    lead,
    ...(note ? ["", "A note from us:", note] : []),
    "",
    "What you can do with it:",
    ...benefits.map((b) => `- ${b}`),
    "",
    closing,
    "",
    `${cta}: ${input.url}`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}
