import { jsonError, jsonResult } from "@/lib/api/respond";
import { MANAGE_PRICES_PERMISSION } from "@/lib/api/types";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import type { AdminBookPackageUpdate } from "@/lib/bookPackages/types";
import { canManagePrices } from "@/server/pricingAccess";
import { updateAdminPackage } from "@/server/bookPackagesService";
import { refreshBookPackages } from "@/server/marketing/marketingNumbers";

type Params = { params: Promise<{ bindingId: string }> };

/** Change a package's photos, touch-ups, price (null hides it), visibility or order. */
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManagePrices(auth.user)) {
    return jsonError(`Missing required permission: ${MANAGE_PRICES_PERMISSION}`, 403);
  }
  const { bindingId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const update: AdminBookPackageUpdate = {};
  for (const key of ["includedPhotos", "editsPerPhoto", "sortOrder"] as const) {
    if (body[key] !== undefined) update[key] = body[key] as number;
  }
  if (body.priceCents !== undefined) update.priceCents = body.priceCents as number | null;
  if (body.active !== undefined) update.active = body.active as boolean;

  const result = await updateAdminPackage(bindingId, update, auth.user.id);
  // The landing quotes package prices, so a saved change must reach it now, not in an hour.
  if (!result.error) refreshBookPackages();
  const status = result.error?.code === "NOT_FOUND" ? 404 : result.error ? 400 : 200;
  return jsonResult(result, status);
}
