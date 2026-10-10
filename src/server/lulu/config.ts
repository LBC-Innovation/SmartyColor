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
  const encoded = process.env.LULU_BASIC_AUTH?.trim();
  if (encoded) return `Basic ${encoded}`;
  const key = process.env.LULU_CLIENT_KEY;
  const secret = process.env.LULU_CLIENT_SECRET;
  if (!key || !secret) {
    throw new Error("Lulu API credentials are not configured");
  }
  const token = Buffer.from(`${key}:${secret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export function luluWebhookSecret(): string | null {
  const secret = process.env.LULU_WEBHOOK_SECRET ?? process.env.LULU_CLIENT_SECRET;
  return secret?.trim() || null;
}

export const DEFAULT_POD_PACKAGE_ID =
  process.env.LULU_DEFAULT_POD_PACKAGE_ID ??
  "0850X1100.BW.STD.PB.060UW444.MXX";
