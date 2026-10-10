const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseServiceConfigured(): boolean {
  return Boolean(SUPABASE_URL?.trim() && SERVICE_ROLE?.trim());
}

/** User-facing hint when auth API routes are disabled. */
export function authNotConfiguredMessage(): string {
  const missing: string[] = [];
  if (!SUPABASE_URL?.trim()) {
    missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!SERVICE_ROLE?.trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return `Auth is not configured on the server. Add ${missing.join(" and ")} to .env.local (local) or Vercel project env (deployed), then restart \`npm run dev\`. Get keys from Supabase → Project Settings → API. The service role key is required for sign-up and admin APIs.`;
}
