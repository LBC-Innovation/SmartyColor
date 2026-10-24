import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { listTestimonialSubmissions } from "@/server/testimonials/testimonialsService";

export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!requirePermission(auth.user, "marketing:testimonials")) {
    return jsonError("Missing required permission: marketing:testimonials", 403);
  }
  const result = await listTestimonialSubmissions();
  return jsonResult(result, result.error ? 500 : 200);
}
