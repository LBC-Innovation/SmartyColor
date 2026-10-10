import { createHmac, timingSafeEqual } from "node:crypto";
import { luluWebhookSecret } from "@/server/lulu/config";

export function verifyLuluWebhookHmac(rawBody: string, headerValue: string | null): boolean {
  const secret = luluWebhookSecret();
  if (!secret || !headerValue) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(headerValue.trim(), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
