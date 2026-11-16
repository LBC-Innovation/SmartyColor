import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { HEARD_FROM_DETAIL_MAX, HEARD_FROM_IDS } from "@/lib/marketing/heardFrom";
import { getSupabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/** Whether the caller has answered (or skipped) "How did you hear about us?". */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { data, error } = await getSupabaseAdmin().from("profiles").select("heard_from").eq("id", auth.user.id).maybeSingle();
  // Before migration 0036 the column doesn't exist: report "answered" so the question stays hidden.
  if (error) return jsonResult({ data: { answered: true }, error: null });
  return jsonResult({ data: { answered: Boolean(data?.heard_from) }, error: null });
}

/** Save the answer once. A later answer replaces "skipped" but never a real answer. */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as { answer?: unknown; detail?: unknown } | null;
  const answer = typeof body?.answer === "string" ? body.answer : "";
  if (!HEARD_FROM_IDS.includes(answer)) return jsonError("Pick one of the answers.", 400, "INVALID_ANSWER");
  const detail = typeof body?.detail === "string" ? body.detail.trim().slice(0, HEARD_FROM_DETAIL_MAX) : "";

  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .update({ heard_from: answer, heard_from_detail: detail || null, heard_from_at: new Date().toISOString() })
    .eq("id", auth.user.id)
    .or("heard_from.is.null,heard_from.eq.skipped");
  if (error) return jsonError(error.message, 500);
  return jsonResult({ data: { saved: true }, error: null });
}
