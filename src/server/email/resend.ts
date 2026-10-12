import "server-only";

/** Transactional mail through Resend's REST API (no SDK dependency). */

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "Colorful Memories <onboarding@resend.dev>";
}

/** Returns false (and logs) when the message could not be handed to Resend. */
export async function sendEmail(message: OutgoingEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    // Local development without a key: surface the message so links can still be followed.
    console.log(
      JSON.stringify({ level: "info", message: "email: RESEND_API_KEY not set, not sending", to: message.to, subject: message.subject }),
    );
    console.log(message.text);
    return process.env.NODE_ENV !== "production";
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        JSON.stringify({ level: "error", message: "email: Resend rejected the message", status: res.status, detail: detail.slice(0, 300) }),
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", message: "email: send failed", error: String(e) }));
    return false;
  }
}
