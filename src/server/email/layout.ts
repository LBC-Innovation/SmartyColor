import "server-only";

/** Shared look for the lifecycle emails: same card as the share and credit emails. */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Header values must stay on one line. */
export function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Server-side money formatting with a fixed locale, so every recipient sees the same thing. */
export function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** "$5" for whole dollars, "$5.50" otherwise: for credit amounts in headlines. */
export function usdShort(cents: number): string {
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : usd(cents);
}

export type EmailBody = {
  eyebrow: string;
  title: string;
  /** Plain text; escaped here. */
  paragraphs: string[];
  /** Label/value rows, e.g. order details. Plain text. */
  details?: Array<[string, string]>;
  image?: { src: string; alt: string };
  cta?: { label: string; url: string };
  /** Plain text under the card. */
  footer: string;
  /** Marketing mail only: adds the unsubscribe link to the footer. */
  unsubscribeUrl?: string;
};

export function renderEmail(body: EmailBody): { html: string; text: string } {
  const paragraphs = body.paragraphs
    .map((p, i) => `<p style="margin:0 0 ${i === body.paragraphs.length - 1 ? 0 : 12}px;">${escapeHtml(p)}</p>`)
    .join("\n                ");
  const image = body.image
    ? `<tr>
              <td style="padding:20px 32px 0;">
                <img src="${escapeHtml(body.image.src)}" alt="${escapeHtml(body.image.alt)}" width="200" style="display:block;width:200px;max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:12px;" />
              </td>
            </tr>`
    : "";
  const details = body.details?.length
    ? `<tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;font-size:14px;line-height:1.5;">
                  ${body.details
                    .map(
                      ([label, value]) =>
                        `<tr><td style="padding:8px 16px;color:#64748b;">${escapeHtml(label)}</td><td style="padding:8px 16px;color:#0a101a;text-align:right;font-weight:600;">${escapeHtml(value)}</td></tr>`,
                    )
                    .join("\n                  ")}
                </table>
              </td>
            </tr>`
    : "";
  const cta = body.cta
    ? `<tr>
              <td style="padding:28px 32px 8px;">
                <a href="${escapeHtml(body.cta.url)}" style="display:inline-block;background:#7446f0;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 24px;border-radius:999px;">${escapeHtml(body.cta.label)}</a>
              </td>
            </tr>`
    : "";
  const unsubscribe = body.unsubscribeUrl
    ? ` <a href="${escapeHtml(body.unsubscribeUrl)}" style="color:#94a3b8;">Unsubscribe</a>`
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
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">${escapeHtml(body.eyebrow)}</p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:700;color:#0a101a;">${escapeHtml(body.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                ${paragraphs}
              </td>
            </tr>
            ${image}
            ${details}
            ${cta}
            <tr><td style="padding:0 0 24px;"></td></tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Colorful Memories · ${escapeHtml(body.footer)}${unsubscribe}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    body.title,
    "",
    ...body.paragraphs.flatMap((p) => [p, ""]),
    ...(body.details?.length ? [...body.details.map(([l, v]) => `${l}: ${v}`), ""] : []),
    ...(body.cta ? [`${body.cta.label}: ${body.cta.url}`, ""] : []),
    body.footer,
    ...(body.unsubscribeUrl ? [`Unsubscribe: ${body.unsubscribeUrl}`] : []),
  ].join("\n");

  return { html, text };
}
