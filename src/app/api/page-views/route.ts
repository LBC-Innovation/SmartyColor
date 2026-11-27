import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { pageViewPath } from "@/lib/activity/pageViews";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/** Records that the signed-in customer opened a screen. Body: { path, search }. */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  let body: { path?: unknown; search?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const path =
    typeof body.path === "string" ? pageViewPath(body.path, typeof body.search === "string" ? body.search : "") : null;
  // Not worth recording is not an error; the browser has nothing to do about it.
  if (!path) return jsonResult({ data: { recorded: false }, error: null });

  const { error } = await getSupabaseAdmin().from("page_views").insert({ user_id: auth.user.id, path });
  if (error) {
    console.log(JSON.stringify({ level: "warn", message: "page view not recorded", userId: auth.user.id, error: error.message }));
    return jsonResult({ data: { recorded: false }, error: null });
  }
  return jsonResult({ data: { recorded: true }, error: null });
}
