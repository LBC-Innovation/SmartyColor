import "server-only";
import { oneLine, renderEmail, usd, usdShort } from "@/server/email/layout";
import type { OutgoingEmail } from "@/server/email/resend";

/**
 * The lifecycle emails from the marketing plan (M14). Copy stays short and plain, and every
 * number in it comes from the caller (real credit granted, real page count, real order total).
 */

const MARKETING_FOOTER = "You get these emails because you have a Colorful Memories account.";

/** RFC 8058 one-click unsubscribe, so mail apps can show their own Unsubscribe button. */
function unsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

type Marketing = {
  to: string;
  /** The page a person lands on from the footer link. */
  unsubscribeUrl: string;
  /** The endpoint mail apps POST to for one-click unsubscribe. */
  oneClickUrl: string;
};

function bookTitle(title: string | null | undefined): string {
  return oneLine(title ?? "") || "your coloring book";
}

export function welcomeEmail(input: Marketing & { creditCents: number | null; albumUrl: string }): OutgoingEmail {
  const credit = input.creditCents && input.creditCents > 0 ? usdShort(input.creditCents) : null;
  const { html, text } = renderEmail({
    eyebrow: "Welcome",
    title: credit ? `Your ${credit} credit is waiting` : "Welcome to Colorful Memories",
    paragraphs: [
      "Thanks for joining Colorful Memories.",
      ...(credit ? [`We added ${credit} to your account. Use it toward a printed coloring book of your family photos.`] : []),
      "Your album keeps every page you make. Add a few more photos and turn them into a book when you are ready.",
    ],
    cta: { label: "Open your album", url: input.albumUrl },
    footer: MARKETING_FOOTER,
    unsubscribeUrl: input.unsubscribeUrl,
  });
  return {
    to: input.to,
    subject: credit ? `Your ${credit} credit is waiting` : "Welcome to Colorful Memories",
    html,
    text,
    headers: unsubscribeHeaders(input.oneClickUrl),
  };
}

export function unfinishedBookEmail(
  input: Marketing & { title: string | null; pageCount: number; coverUrl: string | null; resumeUrl: string },
): OutgoingEmail {
  const title = bookTitle(input.title);
  const pages = `${input.pageCount} ${input.pageCount === 1 ? "page" : "pages"}`;
  const { html, text } = renderEmail({
    eyebrow: "Your book",
    title: "Your coloring book is almost ready",
    paragraphs: [`You started “${title}” and it already has ${pages}.`, "Everything is saved. Pick up right where you left off."],
    image: input.coverUrl ? { src: input.coverUrl, alt: `Cover of ${title}` } : undefined,
    cta: { label: "Finish my book", url: input.resumeUrl },
    footer: MARKETING_FOOTER,
    unsubscribeUrl: input.unsubscribeUrl,
  });
  return {
    to: input.to,
    subject: `Your book has ${pages}. Ready to finish it?`,
    html,
    text,
    headers: unsubscribeHeaders(input.oneClickUrl),
  };
}

export function holidayDeadlineEmail(
  input: Marketing & { dateLabel: string; daysLeft: number; resumeUrl: string },
): OutgoingEmail {
  const when = input.daysLeft <= 0 ? "That is today." : input.daysLeft === 1 ? "That is tomorrow." : null;
  const { html, text } = renderEmail({
    eyebrow: "Christmas delivery",
    title: `Order by ${input.dateLabel} for Christmas delivery`,
    paragraphs: [
      `Books ordered by ${input.dateLabel} arrive in time for Christmas.${when ? ` ${when}` : ""}`,
      "Your draft book is saved. Finish it and it goes to print.",
    ],
    cta: { label: "Finish my book", url: input.resumeUrl },
    footer: MARKETING_FOOTER,
    unsubscribeUrl: input.unsubscribeUrl,
  });
  return {
    to: input.to,
    subject: `Order by ${input.dateLabel} for Christmas delivery`,
    html,
    text,
    headers: unsubscribeHeaders(input.oneClickUrl),
  };
}

export function reviewRequestEmail(input: Marketing & { title: string | null; feedbackUrl: string }): OutgoingEmail {
  const title = bookTitle(input.title);
  const { html, text } = renderEmail({
    eyebrow: "How did it go?",
    title: "How did your coloring book go?",
    paragraphs: [
      `We hope your family is enjoying “${title}”.`,
      "Would you send us a photo of the kids coloring and one line about it? It takes a minute.",
      "We only share it on our site if you tick the box that says we may.",
    ],
    cta: { label: "Share a photo", url: input.feedbackUrl },
    footer: MARKETING_FOOTER,
    unsubscribeUrl: input.unsubscribeUrl,
  });
  return {
    to: input.to,
    subject: "How did your coloring book go?",
    html,
    text,
    headers: unsubscribeHeaders(input.oneClickUrl),
  };
}

export function orderConfirmedEmail(input: {
  to: string;
  title: string | null;
  pageCount: number;
  totalCents: number | null;
  digital: boolean;
  orderUrl: string;
}): OutgoingEmail {
  const title = bookTitle(input.title);
  const { html, text } = renderEmail({
    eyebrow: "Order confirmed",
    title: "Thanks for your order",
    paragraphs: input.digital
      ? [`Your digital book “${title}” is ready.`, "Download the PDF from your order page any time."]
      : [`We got your order for “${title}”.`, "We are sending it to print now. We will email you again when it ships."],
    details: [
      ["Book", title],
      ["Pages", String(input.pageCount)],
      ["Format", input.digital ? "Digital PDF" : "Printed book"],
      ...(input.totalCents != null ? ([["Total", usd(input.totalCents)]] as Array<[string, string]>) : []),
    ],
    cta: { label: input.digital ? "Download my book" : "View my order", url: input.orderUrl },
    footer: "Sent about your order.",
  });
  return { to: input.to, subject: `Order confirmed: ${title}`, html, text };
}

export function orderShippedEmail(input: {
  to: string;
  title: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  orderUrl: string;
}): OutgoingEmail {
  const title = bookTitle(input.title);
  const carrier = oneLine(input.carrier ?? "");
  const { html, text } = renderEmail({
    eyebrow: "Shipped",
    title: "Your book is on its way",
    paragraphs: [
      `“${title}” has left the printer.`,
      input.trackingUrl ? "Use the tracking link to see where it is." : "We will show tracking on your order page as soon as the carrier shares it.",
    ],
    details: [
      ["Book", title],
      ...(carrier ? ([["Carrier", carrier]] as Array<[string, string]>) : []),
      ...(input.trackingNumber ? ([["Tracking number", input.trackingNumber]] as Array<[string, string]>) : []),
    ],
    cta: input.trackingUrl ? { label: "Track my book", url: input.trackingUrl } : { label: "View my order", url: input.orderUrl },
    footer: "Sent about your order.",
  });
  return { to: input.to, subject: `Shipped: ${title}`, html, text };
}
