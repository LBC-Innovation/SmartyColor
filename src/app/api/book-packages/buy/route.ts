import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { PACKAGE_PRICE_CHANGED_CODE, PACKAGE_UNAVAILABLE_CODE, isBookBindingId } from "@/lib/bookPackages/types";
import { buyPackageWithCredit } from "@/server/bookPackagesService";

const STATUS_BY_CODE: Record<string, number> = {
  [PACKAGE_UNAVAILABLE_CODE]: 404,
  [PACKAGE_PRICE_CHANGED_CODE]: 409,
  INSUFFICIENT_CREDITS: 402,
};

/** Buy a package from the wallet: debit, album and package in one database transaction. */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    bindingId?: unknown;
    albumName?: unknown;
    expectedPriceCents?: unknown;
  };
  if (!isBookBindingId(body.bindingId)) return jsonError("Pick a book.", 400);
  const expected = typeof body.expectedPriceCents === "number" && Number.isInteger(body.expectedPriceCents)
    ? body.expectedPriceCents
    : null;

  const result = await buyPackageWithCredit({
    userId: auth.user.id,
    bindingId: body.bindingId,
    albumName: typeof body.albumName === "string" ? body.albumName : null,
    expectedPriceCents: expected,
  });
  return jsonResult(result, result.error ? (STATUS_BY_CODE[result.error.code ?? ""] ?? 500) : 200);
}
