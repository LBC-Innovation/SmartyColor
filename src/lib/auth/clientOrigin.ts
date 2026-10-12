const LOCAL_ORIGIN = "http://localhost:3000";

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function inProduction(): boolean {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
}

/** The deployment's own URL on Vercel: the production domain in production, the deployment URL on previews. */
function vercelOrigin(): string | null {
  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
      : process.env.VERCEL_URL;
  return host ? `https://${host}` : null;
}

export function clientOrigins(): string[] {
  const configured = parseOrigins(process.env.CLIENT_ORIGIN);
  if (configured.length > 0) return configured;
  const appUrl = parseOrigins(process.env.NEXT_PUBLIC_APP_URL);
  if (appUrl.length > 0) return appUrl;
  const vercel = vercelOrigin();
  if (vercel) return [vercel];
  return [LOCAL_ORIGIN];
}

export function clientOrigin(): string {
  const origins = clientOrigins();
  if (inProduction()) {
    // A localhost value left in the deployed env must never end up in an email link.
    return (
      origins.find((o) => !o.includes("localhost")) ?? vercelOrigin() ?? origins[0] ?? LOCAL_ORIGIN
    );
  }
  return origins[0] ?? LOCAL_ORIGIN;
}
