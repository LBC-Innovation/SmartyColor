import "server-only";
import type { OutgoingEmail } from "@/server/email/resend";

/**
 * Follow-up emails sent by the daily lifecycle job: an unfinished book reminder, a review request
 * after a book arrives, and a thank-you when a friend's sign-up earns Share with a friend credit. The
 * first two are marketing and carry an unsubscribe link; the referral note is about the account.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

type Layout = {
  to: string;
  subject: string;
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  cta: { label: string; url: string };
  footer: string;
  unsubscribe?: { page: string; oneClick: string } | null;
};

function render(l: Layout): OutgoingEmail {
  const url = escapeHtml(l.cta.url);
  const unsubscribeHtml = l.unsubscribe
    ? ` · <a href="${escapeHtml(l.unsubscribe.page)}" style="color:#94a3b8;">Unsubscribe from reminders</a>`
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
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">${escapeHtml(l.eyebrow)}</p>
                <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:700;color:#0a101a;">${escapeHtml(l.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-size:16px;line-height:1.55;color:#1f2937;">
                ${l.paragraphs.map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p)}</p>`).join("\n                ")}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px;">
                <a href="${url}" style="display:inline-block;background:#7446f0;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 24px;border-radius:999px;">${escapeHtml(l.cta.label)}</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Colorful Memories · ${escapeHtml(l.footer)}${unsubscribeHtml}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    l.heading,
    "",
    ...l.paragraphs.flatMap((p) => [p, ""]),
    `${l.cta.label}: ${l.cta.url}`,
    "",
    `Colorful Memories · ${l.footer}`,
    ...(l.unsubscribe ? [`Unsubscribe from reminders: ${l.unsubscribe.page}`] : []),
  ].join("\n");
  return {
    to: l.to,
    subject: l.subject,
    html,
    text,
    ...(l.unsubscribe
      ? { headers: { "List-Unsubscribe": `<${l.unsubscribe.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
      : {}),
  };
}

export function unfinishedBookEmail(input: {
  to: string;
  bookTitle: string;
  pageCount: number;
  url: string;
  unsubscribe: { page: string; oneClick: string } | null;
}): OutgoingEmail {
  const title = input.bookTitle.trim() || "your coloring book";
  const pages = input.pageCount > 0 ? `${input.pageCount} pages` : "your pages";
  return render({
    to: input.to,
    subject: `Your coloring book is waiting: ${title}`,
    eyebrow: "Your book",
    heading: "Your coloring book is almost ready",
    paragraphs: [
      `You started "${title}" with ${pages}. Everything is saved just where you left it.`,
      "Pick a binding, check the pages and it's on its way. Printed books make a lovely keepsake for grandparents, too.",
    ],
    cta: { label: "Finish my book", url: input.url },
    footer: "Sent because you started a book and didn't order it yet.",
    unsubscribe: input.unsubscribe,
  });
}

export function reviewRequestEmail(input: {
  to: string;
  digital: boolean;
  reviewUrl: string;
  unsubscribe: { page: string; oneClick: string } | null;
}): OutgoingEmail {
  return render({
    to: input.to,
    subject: input.digital ? "How did your coloring pages turn out?" : "How did your coloring book turn out?",
    eyebrow: "A quick favor",
    heading: input.digital ? "How did your pages turn out?" : "How did your book turn out?",
    paragraphs: [
      "We're a small family business, and a short review is the biggest help to other parents deciding whether to try us.",
      "It takes a minute. And if anything wasn't right, just reply to this email and we'll fix it.",
    ],
    cta: { label: "Leave a review", url: input.reviewUrl },
    footer: "Sent once, after your order.",
    unsubscribe: input.unsubscribe,
  });
}

export function referralCreditEmail(input: { to: string; amountCents: number; url: string }): OutgoingEmail {
  const amount = usd(input.amountCents);
  return render({
    to: input.to,
    subject: `Your friend joined, and you earned ${amount}`,
    eyebrow: "Share with a friend",
    heading: `${amount} added to your account`,
    paragraphs: [
      `A friend you shared Colorful Memories with just signed up, so we've added ${amount} in credit to your account.`,
      "Keep sharing your link: every friend who signs up through it earns you credit again.",
    ],
    cta: { label: "Share my link", url: input.url },
    footer: "Sent because your referral credit was added.",
  });
}
