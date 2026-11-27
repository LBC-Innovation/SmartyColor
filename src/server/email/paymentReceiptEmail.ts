import "server-only";
import { CONTACT_EMAIL } from "@/content/marketing";
import type { PaymentEntry } from "@/lib/payments/types";
import type { OutgoingEmail } from "@/server/email/resend";
import { EMAIL_LOGO_HEIGHT, EMAIL_LOGO_PNG_BASE64, EMAIL_LOGO_WIDTH } from "@/server/email/brandLogo";

const LOGO_CID = "cm-logo";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function receiptDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

/** Short, stable receipt number from the payment line's id. */
export function receiptNumber(entryId: string): string {
  const raw = entryId.split(":").slice(1).join(":").replace(/[^A-Za-z0-9]/g, "");
  return `CM-${raw.slice(-10).toUpperCase()}`;
}

function paidWith(entry: PaymentEntry, card: { brand: string | null; last4: string | null } | null): string {
  const cardText = card?.last4
    ? `${card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Card"} ending ${card.last4}`
    : "Card";
  if (entry.kind === "card_refund") return entry.walletDeltaCents ? `${cardText} (from your wallet balance)` : cardText;
  if (entry.channel === "card") return cardText;
  if (entry.kind === "refund") return "Colorful Memories wallet";
  return "Colorful Memories wallet balance";
}

/**
 * A receipt for one payment or refund, sent from the admin customer drawer. Works for card
 * charges, wallet purchases and refunds alike; the amounts come from the server's own records.
 */
export function paymentReceiptEmail(input: {
  to: string;
  customerName: string | null;
  entry: PaymentEntry;
  card: { brand: string | null; last4: string | null } | null;
  /** Optional line from the admin, shown as written. */
  message?: string;
  accountUrl: string;
}): OutgoingEmail {
  const { entry } = input;
  const isRefund = entry.kind === "refund" || entry.kind === "card_refund";
  const amount = usd(Math.abs(entry.amountCents));
  const number = receiptNumber(entry.id);
  const date = receiptDate(entry.at);
  const title = isRefund ? "Refund receipt" : "Payment receipt";
  const subject = `Your Colorful Memories ${isRefund ? "refund" : "receipt"} ${number}`;
  const greeting = input.customerName?.trim() ? `Hi ${input.customerName.trim()},` : "Hi,";
  const lead = isRefund
    ? `Here is your receipt for the ${amount} refund we issued on ${date}.`
    : `Thank you! Here is your receipt for the ${amount} payment on ${date}.`;
  const method = paidWith(entry, input.card);
  const rows: Array<[string, string]> = [
    ["Receipt", number],
    ["Date", date],
    ["Item", entry.label + (entry.note ? ` (${entry.note})` : "")],
    [isRefund ? "Refunded to" : "Paid with", method],
    [isRefund ? "Amount refunded" : "Amount paid", amount],
  ];
  if (entry.kind === "topup" && entry.walletBalanceAfterCents != null) {
    rows.push(["Added to your wallet", usd(entry.walletDeltaCents ?? 0)]);
  }
  if (entry.kind === "card_refund" && isRefund && entry.refundStatus !== "succeeded" && entry.refundStatus) {
    rows.push(["Status", entry.refundStatus === "pending" ? "Processing" : "Not completed"]);
  }
  const refundNote = entry.kind === "card_refund" ? "Card refunds usually show on your statement within 5–10 business days." : null;
  const message = input.message?.trim() ?? "";

  const rowsHtml = rows
    .map(
      ([k, v], i) => `<tr>
                      <td style="padding:10px 0;${i ? "border-top:1px solid #eef0f4;" : ""}font-size:14px;color:#64748b;">${escapeHtml(k)}</td>
                      <td style="padding:10px 0;${i ? "border-top:1px solid #eef0f4;" : ""}font-size:14px;color:#0a101a;text-align:right;font-weight:${i === rows.length - 1 || k.startsWith("Amount") ? 700 : 500};">${escapeHtml(v)}</td>
                    </tr>`,
    )
    .join("\n");

  const messageHtml = message
    ? `<tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ff;border-radius:12px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:15px;line-height:1.5;color:#1f2937;">
                      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">A note from us</p>
                      <p style="margin:0;white-space:pre-line;">${escapeHtml(message)}</p>
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
              <td style="padding:28px 32px 0;">
                <img src="cid:${LOGO_CID}" width="${EMAIL_LOGO_WIDTH}" height="${EMAIL_LOGO_HEIGHT}" alt="Colorful Memories" style="display:block;border:0;width:${EMAIL_LOGO_WIDTH}px;max-width:100%;height:auto;">
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">${title}</p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:700;color:#0a101a;">${amount}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                <p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>
                <p style="margin:0;">${escapeHtml(lead)}</p>
              </td>
            </tr>
            ${messageHtml}
            <tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${rowsHtml}
                </table>
              </td>
            </tr>
            ${refundNote ? `<tr><td style="padding:12px 32px 0;font-size:13px;line-height:1.5;color:#64748b;">${escapeHtml(refundNote)}</td></tr>` : ""}
            <tr>
              <td style="padding:24px 32px 32px;font-size:14px;line-height:1.55;color:#475569;">
                Questions about this ${isRefund ? "refund" : "payment"}? Just reply to this email or write to
                <a href="mailto:${CONTACT_EMAIL}" style="color:#7446f0;">${CONTACT_EMAIL}</a>.
                <br><a href="${escapeHtml(input.accountUrl)}" style="color:#7446f0;">See your account</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Colorful Memories · Keep this email for your records.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${title}: ${amount}`,
    "",
    greeting,
    lead,
    ...(message ? ["", "A note from us:", message] : []),
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(refundNote ? ["", refundNote] : []),
    "",
    `Questions? Reply to this email or write to ${CONTACT_EMAIL}.`,
    `Your account: ${input.accountUrl}`,
  ].join("\n");

  return {
    to: input.to,
    subject,
    html,
    text,
    replyTo: CONTACT_EMAIL,
    attachments: [
      {
        filename: "colorful-memories.png",
        content: Buffer.from(EMAIL_LOGO_PNG_BASE64, "base64"),
        contentId: LOGO_CID,
        contentType: "image/png",
      },
    ],
  };
}
