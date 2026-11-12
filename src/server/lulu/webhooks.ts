import { createHmac, timingSafeEqual } from "node:crypto";
import { luluWebhookSecrets } from "@/server/lulu/config";

export function verifyLuluWebhookHmac(rawBody: string, headerValue: string | null): boolean {
  const secrets = luluWebhookSecrets();
  if (secrets.length === 0 || !headerValue) return false;

  const given = Buffer.from(headerValue.trim().toLowerCase(), "utf8");
  return secrets.some((secret) => {
    const expected = Buffer.from(
      createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"),
      "utf8",
    );
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}
