export function luluApiBase(): string {
  return (
    process.env.LULU_API_BASE?.replace(/\/$/, "") ??
    "https://api.sandbox.lulu.com"
  );
}

export function luluConfigured(): boolean {
  return Boolean(process.env.LULU_CLIENT_KEY && process.env.LULU_CLIENT_SECRET);
}

export function luluBasicAuthHeader(): string {
  const key = process.env.LULU_CLIENT_KEY?.trim();
  const secret = process.env.LULU_CLIENT_SECRET?.trim();
  if (key && secret) {
    const token = Buffer.from(`${key}:${secret}`, "utf8").toString("base64");
    return `Basic ${token}`;
  }

  const raw = process.env.LULU_BASIC_AUTH?.trim();
  if (!raw) {
    throw new Error("Lulu API credentials are not configured");
  }
  if (/^basic\s+/i.test(raw)) {
    return raw.replace(/^basic\s+/i, "Basic ");
  }
  return `Basic ${raw}`;
}

/**
 * Lulu signs webhooks (Lulu-HMAC-SHA256) with the webhook owner's API secret, i.e. the client
 * secret. LULU_WEBHOOK_SECRET is an optional extra candidate, never a replacement.
 */
export function luluWebhookSecrets(): string[] {
  const out = [process.env.LULU_CLIENT_SECRET, process.env.LULU_WEBHOOK_SECRET]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  return [...new Set(out)];
}

export function luluWebhookSecret(): string | null {
  return luluWebhookSecrets()[0] ?? null;
}

export const DEFAULT_POD_PACKAGE_ID =
  process.env.LULU_DEFAULT_POD_PACKAGE_ID ??
  "0850X1100.BW.STD.PB.060UW444.MXX";
