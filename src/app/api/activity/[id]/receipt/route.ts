import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as activity from "@/server/activityService";

type Params = { params: Promise<{ id: string }> };

/** Link to Stripe's receipt for one of the user's card top-ups. */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await activity.getActivityReceiptUrl(auth.user.id, id);
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404, "NOT_FOUND");
  if (result.error?.code === "STRIPE_NOT_CONFIGURED") {
    return jsonError(result.error.message, 503, "STRIPE_NOT_CONFIGURED");
  }
  return jsonResult(result, result.error ? 502 : 200);
}
