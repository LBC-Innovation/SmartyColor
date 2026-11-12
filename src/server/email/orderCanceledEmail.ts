import "server-only";
import { CONTACT_EMAIL } from "@/content/marketing";
import type { OutgoingEmail } from "@/server/email/resend";

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

export type OrderCanceledInput = {
  to: string;
  orderId: string;
  title: string;
  refundedCents: number;
  /** Canceled by Colorful Memories rather than the customer. */
  canceledByAdmin: boolean;
  /** Only shown when an admin canceled; a customer already knows their own reason. */
  reason: string | null;
  orderUrl: string;
};

/** Sent once when a paid order is canceled before production. */
export function orderCanceledEmail(input: OrderCanceledInput): OutgoingEmail {
  const shortId = input.orderId.slice(0, 8).toUpperCase();
  const subject = `Your Colorful Memories order ${shortId} was canceled`;
  const lead = input.canceledByAdmin
    ? `We canceled your order for “${input.title}” before it went to print.`
    : `Your order for “${input.title}” is canceled. It won't be printed or shipped.`;
  const reason = input.canceledByAdmin && input.reason ? `Reason: ${input.reason}` : null;
  const refund =
    input.refundedCents > 0
      ? `We returned ${usd(input.refundedCents)} to your Colorful Memories wallet. You can use it on your next book right away.`
      : null;
  const follow = `Questions? Reply to this email or write to ${CONTACT_EMAIL}.`;
  const cta = "View your order";
  const paras = [lead, reason, refund, follow].filter((p): p is string => Boolean(p));

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a101a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Order ${escapeHtml(shortId)}</p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:700;color:#0a101a;">Your order is canceled</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                ${paras.map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p)}</p>`).join("\n                ")}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px;">
                <a href="${escapeHtml(input.orderUrl)}" style="display:inline-block;background:#7446f0;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 24px;border-radius:999px;">${cta}</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Colorful Memories · Sent because your order was canceled.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = ["Your order is canceled", "", ...paras.flatMap((p) => [p, ""]), `${cta}: ${input.orderUrl}`].join("\n");
  return { to: input.to, subject, html, text, replyTo: CONTACT_EMAIL };
}
