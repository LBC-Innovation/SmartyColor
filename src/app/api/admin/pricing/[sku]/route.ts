import { jsonError, jsonResult } from "@/lib/api/respond";
import { MANAGE_PRICES_PERMISSION } from "@/lib/api/types";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import type { PriceSku } from "@/lib/pricing/types";
import { canManagePrices } from "@/server/pricingAccess";
import { updatePriceItem, type PriceItemUpdate } from "@/server/pricingService";

type Params = { params: Promise<{ sku: string }> };

function numberField(value: unknown, name: string): number | undefined | { error: string } {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return { error: `${name} must be a number` };
  return value;
}

/** Change an item's cost, markup, minimum price, free uses or whether it is charged. */
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManagePrices(auth.user)) {
    return jsonError(`Missing required permission: ${MANAGE_PRICES_PERMISSION}`, 403);
  }

  const { sku } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const update: PriceItemUpdate = {};
  for (const key of ["unitCostCents", "markupPct", "minPriceCents", "freeQuota"] as const) {
    const value = numberField(body[key], key);
    if (typeof value === "object") return jsonError(value.error, 400);
    if (value !== undefined) update[key] = value;
  }
  if (body.billable !== undefined) {
    if (typeof body.billable !== "boolean") return jsonError("billable must be true or false", 400);
    update.billable = body.billable;
  }

  const result = await updatePriceItem(sku as PriceSku, update, auth.user.id);
  if (result.error?.code === "PRICE_MISSING") return jsonError(result.error.message, 404, result.error.code);
  return jsonResult(result, result.error ? 400 : 200);
}
