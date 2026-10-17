import { jsonError, jsonResult } from "@/lib/api/respond";
import { MANAGE_PRICES_PERMISSION } from "@/lib/api/types";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { luluConfigured } from "@/server/lulu/config";
import { canManagePrices } from "@/server/pricingAccess";
import { samplePrintCosts } from "@/server/pricingService";

export const dynamic = "force-dynamic";

/** Lulu's live cost for a sample book in each binding (`?pages=24`). */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManagePrices(auth.user)) {
    return jsonError(`Missing required permission: ${MANAGE_PRICES_PERMISSION}`, 403);
  }
  if (!luluConfigured()) return jsonError("Lulu API is not configured", 503);

  const pages = Number.parseInt(new URL(request.url).searchParams.get("pages") ?? "24", 10);
  if (!Number.isInteger(pages) || pages < 1 || pages > 800) return jsonError("pages must be 1–800", 400);
  return jsonResult({ data: await samplePrintCosts(pages), error: null });
}
