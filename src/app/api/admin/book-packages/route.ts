import { jsonError, jsonResult } from "@/lib/api/respond";
import { MANAGE_PRICES_PERMISSION } from "@/lib/api/types";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { canManagePrices } from "@/server/pricingAccess";
import { listAdminPackages } from "@/server/bookPackagesService";

export const dynamic = "force-dynamic";

/** Every package in the catalog, including hidden ones. */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManagePrices(auth.user)) {
    return jsonError(`Missing required permission: ${MANAGE_PRICES_PERMISSION}`, 403);
  }
  const result = await listAdminPackages();
  return jsonResult(result, result.error ? 500 : 200);
}
