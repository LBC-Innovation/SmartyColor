const LOCAL_ORIGIN = "http://localhost:3000";

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

function inProduction(): boolean {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
}

export function clientOrigins(): string[] {
  const configured = parseOrigins(process.env.CLIENT_ORIGIN);
  if (configured.length > 0) return configured;
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return [process.env.NEXT_PUBLIC_APP_URL];
  }
  if (process.env.VERCEL_URL) {
    return [`https://${process.env.VERCEL_URL}`];
  }
  return [LOCAL_ORIGIN];
}

export function clientOrigin(): string {
  const origins = clientOrigins();
  if (inProduction()) {
    return origins.find((o) => !o.includes("localhost")) ?? origins[0] ?? LOCAL_ORIGIN;
  }
  return origins[0] ?? LOCAL_ORIGIN;
}
