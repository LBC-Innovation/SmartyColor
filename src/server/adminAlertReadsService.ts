import "server-only";
import type { ApiResult } from "@/lib/api/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/**
 * Which admin alerts an admin has marked read (table admin_alert_reads, migration 0046). The alerts
 * themselves are computed in the browser from orders, AI usage, pricing and finance.
 */

const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });

/** Read marks older than this are dropped from the list; their alerts have long since changed. */
const KEEP_DAYS = 120;
const MAX_KEY = 300;

function missingTable(message: string | undefined): boolean {
  return Boolean(message && /schema cache|does not exist|relation/i.test(message));
}

const MISSING = "Apply database migration 0046 to remember read alerts.";

export function validAlertKey(key: unknown): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= MAX_KEY;
}

export async function listAlertReads(userId: string): Promise<ApiResult<string[]>> {
  const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("admin_alert_reads")
    .select("alert_key")
    .eq("user_id", userId)
    .gte("read_at", since)
    .limit(2000);
  if (error) return err(missingTable(error.message) ? MISSING : error.message, missingTable(error.message) ? "NOT_SET_UP" : undefined);
  return { data: (data ?? []).map((r) => r.alert_key as string), error: null };
}

export async function markAlertsRead(userId: string, keys: string[]): Promise<ApiResult<{ keys: string[] }>> {
  if (keys.length === 0) return { data: { keys }, error: null };
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("admin_alert_reads")
    .upsert(
      keys.map((alert_key) => ({ user_id: userId, alert_key, read_at: now })),
      { onConflict: "user_id,alert_key" },
    );
  if (error) return err(missingTable(error.message) ? MISSING : error.message, missingTable(error.message) ? "NOT_SET_UP" : undefined);
  return { data: { keys }, error: null };
}

export async function markAlertUnread(userId: string, key: string): Promise<ApiResult<{ key: string }>> {
  const { error } = await getSupabaseAdmin().from("admin_alert_reads").delete().eq("user_id", userId).eq("alert_key", key);
  if (error) return err(missingTable(error.message) ? MISSING : error.message, missingTable(error.message) ? "NOT_SET_UP" : undefined);
  return { data: { key }, error: null };
}
