import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/** Turns marketing email off (or back on) for an account. Order and shipping emails are unaffected. */
export async function setMarketingOptOut(userId: string, optOut: boolean): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .update({ marketing_emails_opt_out_at: optOut ? new Date().toISOString() : null })
    .eq("id", userId);
  if (error) {
    console.error(JSON.stringify({ level: "error", message: "marketing opt-out update failed", userId, error: error.message }));
    return false;
  }
  return true;
}
