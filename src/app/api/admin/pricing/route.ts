import { jsonError, jsonResult } from "@/lib/api/respond";
import { MANAGE_PRICES_PERMISSION } from "@/lib/api/types";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import type { AdminPricingData } from "@/lib/pricing/types";
import { canManagePrices } from "@/server/pricingAccess";
import { listPriceChanges, listPriceItems, observedAiCosts } from "@/server/pricingService";

export const dynamic = "force-dynamic";

/** The whole catalog with our costs, the AI cost we actually see, and recent price changes. */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManagePrices(auth.user)) {
    return jsonError(`Missing required permission: ${MANAGE_PRICES_PERMISSION}`, 403);
  }

  const [items, observed, changes] = await Promise.all([listPriceItems(), observedAiCosts(), listPriceChanges()]);
  if (items.error) return jsonResult(items, 500);
  const data: AdminPricingData = {
    items: items.data,
    observedAiCosts: observed.data ?? [],
    changes: changes.data ?? [],
  };
  return jsonResult({ data, error: null });
}
