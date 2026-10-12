import { jsonResult } from "@/lib/api/respond";
import { isActivityCategory } from "@/lib/activity/types";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as activity from "@/server/activityService";

/** The signed-in user's own history: ?category=&type=&money=1&offset=&limit= */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const params = new URL(request.url).searchParams;
  const category = params.get("category");
  const type = params.get("type")?.trim();
  const offset = Number.parseInt(params.get("offset") ?? "", 10);
  const limit = Number.parseInt(params.get("limit") ?? "", 10);

  const result = await activity.listActivityForUser(auth.user.id, {
    category: isActivityCategory(category) ? category : undefined,
    type: type || undefined,
    moneyOnly: params.get("money") === "1",
    offset: Number.isFinite(offset) ? offset : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  return jsonResult(result, result.error ? 500 : 200);
}
