import "server-only";
import type { Attribution } from "@/lib/marketing/attribution";
import { getSupabaseAdmin } from "@/lib/supabase/service";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

/**
 * Copy the visitor's campaign touches onto a profile or order. Best effort: a sign-up or order
 * never fails because attribution couldn't be saved.
 */
export async function saveAttribution(
  table: "profiles" | "book_orders",
  id: string,
  attribution: Attribution | null,
): Promise<void> {
  if (!attribution) return;
  try {
    // Never overwrite: a repeat sign-up with an existing email must not rewrite that account's source.
    const { error } = await getSupabaseAdmin()
      .from(table)
      .update({ attribution })
      .eq("id", id)
      .is("attribution", null);
    if (error) log("warn", "Attribution not saved", { table, id, error: error.message });
  } catch (e) {
    log("warn", "Attribution not saved", { table, id, error: e instanceof Error ? e.message : String(e) });
  }
}
