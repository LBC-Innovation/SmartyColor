import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseAuth: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

export { supabaseServiceConfigured, authNotConfiguredMessage } from "@/lib/supabase/authServerConfig";

function getSupabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set for server auth");
  }
  return key;
}

/** JWT validation and auth.admin.* — no accessToken pin. */
export function getSupabaseAuth(): SupabaseClient {
  if (!supabaseAuth) {
    const url = getSupabaseUrl();
    const serviceKey = getServiceKey();
    if (!url) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL must be set");
    supabaseAuth = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAuth;
}

/** PostgREST with service role on every request. */
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = getSupabaseUrl();
    const serviceKey = getServiceKey();
    if (!url) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL must be set");
    supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      accessToken: async () => serviceKey,
    });
  }
  return supabaseAdmin;
}
