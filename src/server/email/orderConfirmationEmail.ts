import "server-only";
import { shippingLevelLabel } from "@/lib/orders/shippingLevels";
import { CONTACT_EMAIL } from "@/content/marketing";
import type { OutgoingEmail } from "@/server/email/resend";
import { EMAIL_LOGO_HEIGHT, EMAIL_LOGO_PNG_BASE64, EMAIL_LOGO_WIDTH } from "@/server/email/brandLogo";

const LOGO_CID = "cm-logo";
const COVER_CID = "book-cover";

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
 * A plain date from Lulu ("2026-11-27") as "Nov 27", read as that calendar day whatever time zone
 * the server runs in.
 */
function emailDay(value: string): string {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = plain ? new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]))) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: plain ? "UTC" : undefined });
}

/** "Nov 27 – Dec 2", a single day, or null when neither end is known. */
function deliveryRange(min: string | null | undefined, max: string | null | undefined): string | null {
  const from = min ? emailDay(min) : "";
  const to = max ? emailDay(max) : "";
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to || null;
}

const DEFAULT_TIME_ZONE = "America/New_York";

/** A real IANA zone name, or the default. */
function safeTimeZone(zone: string | null | undefined): string {
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** "3:42 PM EST on Fri, Nov 14" in the given zone. */
function emailDeadline(iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" });
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  return `${time} on ${day}`;
}

/** What the customer will see on the order page, in the printer's order. Mirrors the page's own copy. */
const NEXT_STEPS: { label: string; detail: string }[] = [
  {
    label: "Order placed",
    detail: "Your payment is confirmed and your book goes to the printer. They have a short window to review it before production starts.",
  },
  {
    label: "Printing",
    detail: "Your pages are printed and bound, typically a few business days.",
  },
  {
    label: "Shipped",
    detail: "Your package is on its way. Tracking appears on your order page.",
  },
  { label: "Delivered", detail: "The carrier confirms delivery to your address." },
];

export type OrderConfirmationInput = {
  to: string;
  orderId: string;
  title: string;
  /** e.g. "Paperback" */
  bindingLabel: string;
  /** Printed sides (blank backs included). */
  pageCount: number;
  /** Each page printed on its own sheet with a blank back. */
  blankBacks?: boolean;
  isGift: boolean;
  /** One line per address row, already in display order. */
  shipTo: string[];
  printCents: number | null;
  shippingCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  orderUrl: string;
  /** Opens the order page with the cancel dialog up. */
  cancelUrl: string;
  /** When the full-refund cancel window closes (ISO); the email names the time when known. */
  cancelDeadline?: string | null;
  /** The buyer's IANA time zone, from their browser; the deadline is shown in it. */
  timeZone?: string | null;
  /** Lulu's shipping level, e.g. "MAIL"; named for the customer on the shipping line. */
  shippingLevel?: string | null;
  /** The printer's estimated delivery window (YYYY-MM-DD); the line is left out without one. */
  estimatedDeliveryMin?: string | null;
  estimatedDeliveryMax?: string | null;
  /** A small JPEG of the book's front cover; left out when the order has none. */
  coverThumb?: { jpeg: Uint8Array; width: number; height: number } | null;
};

/** Sent once when a printed-book order is paid and on its way to the printer. */
export function orderConfirmationEmail(input: OrderConfirmationInput): OutgoingEmail {
  const shortId = input.orderId.slice(0, 8).toUpperCase();
  const subject = `Your Colorful Memories order ${shortId} is placed`;
  const lead =
    "Thank you for your order! Your payment is confirmed and your book is on its way to the printer.";
  const details: [string, string][] = [
    ["Order number", shortId],
    ["Book", input.title],
    ["Binding", input.bindingLabel],
    ["Pages", input.blankBacks ? `${Math.floor(input.pageCount / 2)}, each with a blank back` : String(input.pageCount)],
    ["Gift", input.isGift ? "Yes" : "No"],
  ];
  const money: [string, string][] = [];
  if (input.printCents != null) money.push(["Printing", usd(input.printCents)]);
  if (input.shippingCents != null) money.push([`Shipping (${shippingLevelLabel(input.shippingLevel)})`, usd(input.shippingCents)]);
  if (input.taxCents != null) money.push(["Sales tax", usd(input.taxCents)]);
  const total = input.totalCents != null ? usd(input.totalCents) : null;
  const follow = `We'll keep your order page up to date as the printer reports progress. Questions? Reply to this email or write to ${CONTACT_EMAIL}.`;
  const deadline = input.cancelDeadline ? emailDeadline(input.cancelDeadline, safeTimeZone(input.timeZone)) : null;
  const cancelHeading = deadline ? `Cancel by ${deadline} for a full refund` : null;
  const cancelNote = deadline
    ? `Changed your mind? You can cancel this order for a full refund to your credit balance until ${deadline}, when your book goes into production. After that it can't be canceled.`
    : "Changed your mind? You can cancel for a full refund to your credit balance until your book goes into production, usually about an hour after you order.";
  const cta = "View your order";
  const delivery = deliveryRange(input.estimatedDeliveryMin, input.estimatedDeliveryMax);
  const deliveryNote = "This is the printer's estimate, not a guarantee. Tracking appears on your order page once it ships.";
  const url = escapeHtml(input.orderUrl);
  // Shown at half its pixel size so it stays sharp on high-density screens.
  const cover = input.coverThumb
    ? { width: Math.round(input.coverThumb.width / 2), height: Math.round(input.coverThumb.height / 2) }
    : null;

  const rowHtml = ([k, v]: [string, string], bold = false) =>
    `<tr><td style="padding:3px 0;color:#64748b;">${escapeHtml(k)}</td><td align="right" style="padding:3px 0;${bold ? "font-weight:700;" : "font-weight:600;"}color:#0a101a;">${escapeHtml(v)}</td></tr>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a101a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
            <tr>
              <td style="padding:28px 32px 0;">
                <img src="cid:${LOGO_CID}" width="${EMAIL_LOGO_WIDTH}" height="${EMAIL_LOGO_HEIGHT}" alt="Colorful Memories" style="display:block;border:0;outline:none;text-decoration:none;width:${EMAIL_LOGO_WIDTH}px;max-width:100%;height:auto;">
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px;">
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Order confirmation</p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:700;color:#0a101a;">Thanks for placing an order!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                <p style="margin:0;">${escapeHtml(lead)}</p>
              </td>
            </tr>
${cancelHeading ? `            <tr>
              <td style="padding:16px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 16px;font-size:15px;line-height:1.5;color:#78350f;">
                      <p style="margin:0;"><strong>${escapeHtml(cancelHeading)}.</strong></p>
                      <p style="margin:4px 0 0;font-size:13px;color:#92400e;">After that your book is in production and the order can't be canceled. <a href="${escapeHtml(input.cancelUrl)}" style="color:#b45309;font-weight:600;">Cancel this order</a></p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
` : ""}            <tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ff;border-radius:12px;">
                  <tr>
${cover ? `                    <td width="${cover.width + 16}" valign="top" style="padding:14px 0 14px 16px;">
                      <img src="cid:${COVER_CID}" width="${cover.width}" height="${cover.height}" alt="Cover of ${escapeHtml(input.title)}" style="display:block;border:0;border-radius:6px;box-shadow:0 1px 3px rgba(15,23,42,0.18);width:${cover.width}px;height:${cover.height}px;">
                    </td>
` : ""}                    <td valign="top" style="padding:14px 16px;font-size:15px;line-height:1.5;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
                        ${details.map((d) => rowHtml(d)).join("\n                        ")}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;font-size:15px;line-height:1.55;color:#1f2937;">
                <p style="margin:0 0 6px;font-weight:600;">Shipping to</p>
                <p style="margin:0;color:#475569;">${input.shipTo.map(escapeHtml).join("<br>")}</p>
              </td>
            </tr>
${delivery ? `            <tr>
              <td style="padding:16px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 16px;font-size:15px;line-height:1.5;color:#064e3b;">
                      <p style="margin:0;"><strong>Estimated delivery:</strong> ${escapeHtml(delivery)}</p>
                      <p style="margin:4px 0 0;font-size:13px;color:#047857;">${escapeHtml(deliveryNote)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
` : ""}
            <tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;border-top:1px solid #e5e7eb;">
                  ${money.map((m) => rowHtml(m)).join("\n                  ")}
                  ${total ? rowHtml(["Total charged", total], true) : ""}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;font-size:15px;line-height:1.55;color:#1f2937;">
                <p style="margin:0 0 8px;font-weight:600;">What happens next</p>
                <ol style="margin:0;padding:0 0 0 20px;color:#475569;">
                  ${NEXT_STEPS.map((s) => `<li style="margin:0 0 6px;"><strong style="color:#1f2937;">${escapeHtml(s.label)}.</strong> ${escapeHtml(s.detail)}</li>`).join("\n                  ")}
                </ol>
                <p style="margin:12px 0 0;color:#475569;">${escapeHtml(follow)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 24px;">
                <a href="${url}" style="display:inline-block;background:#7446f0;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 24px;border-radius:999px;">${cta}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;font-size:14px;line-height:1.55;color:#64748b;border-top:1px solid #e5e7eb;">
                <p style="margin:20px 0 0;">${escapeHtml(cancelNote)} <a href="${escapeHtml(input.cancelUrl)}" style="color:#7446f0;font-weight:600;">Cancel this order</a></p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Colorful Memories · Sent because you placed an order.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Thanks for placing an order!",
    "",
    lead,
    "",
    ...(cancelHeading ? [`${cancelHeading}. After that the order can't be canceled.`, ""] : []),
    ...details.map(([k, v]) => `${k}: ${v}`),
    "",
    "Shipping to:",
    ...input.shipTo,
    "",
    ...(delivery ? [`Estimated delivery: ${delivery}`, deliveryNote, ""] : []),
    ...money.map(([k, v]) => `${k}: ${v}`),
    ...(total ? [`Total charged: ${total}`] : []),
    "",
    "What happens next:",
    ...NEXT_STEPS.map((s, i) => `${i + 1}. ${s.label}. ${s.detail}`),
    "",
    follow,
    "",
    `${cta}: ${input.orderUrl}`,
    "",
    `${cancelNote} Cancel this order: ${input.cancelUrl}`,
  ].join("\n");

  const attachments: NonNullable<OutgoingEmail["attachments"]> = [
    {
      filename: "colorful-memories.png",
      content: Buffer.from(EMAIL_LOGO_PNG_BASE64, "base64"),
      contentId: LOGO_CID,
      contentType: "image/png",
    },
  ];
  if (input.coverThumb) {
    attachments.push({
      filename: "book-cover.jpg",
      content: input.coverThumb.jpeg,
      contentId: COVER_CID,
      contentType: "image/jpeg",
    });
  }

  return { to: input.to, subject, html, text, replyTo: CONTACT_EMAIL, attachments };
}
