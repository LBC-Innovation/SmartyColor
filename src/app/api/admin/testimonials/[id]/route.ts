import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { reviewTestimonial } from "@/server/testimonials/testimonialsService";

type Params = { params: Promise<{ id: string }> };

const STATUSES = new Set(["approved", "rejected", "pending"]);

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!requirePermission(auth.user, "marketing:testimonials")) {
    return jsonError("Missing required permission: marketing:testimonials", 403);
  }
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = body?.status;
  if (typeof status !== "string" || !STATUSES.has(status)) return jsonError("Invalid status", 400);
  const result = await reviewTestimonial({
    id,
    status: status as "approved" | "rejected" | "pending",
    reviewerId: auth.user.id,
  });
  if (result.error?.code === "NOT_FOUND") return jsonError(result.error.message, 404);
  if (result.error?.code === "NO_CONSENT") return jsonError(result.error.message, 409, "NO_CONSENT");
  return jsonResult(result, result.error ? 500 : 200);
}
