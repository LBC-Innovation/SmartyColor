export function stripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key || null;
}

export function stripeWebhookSecret(): string | null {
  const key = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return key || null;
}

export function stripeConfigured(): boolean {
  return Boolean(stripeSecretKey());
}

export function appOrigin(): string {
  const raw =
    process.env.CLIENT_ORIGIN?.split(",")[0]?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}
