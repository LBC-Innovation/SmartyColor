import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { resolveCreditDeltaCents } from "@/server/creditsService";
import * as promo from "@/server/promoCreditsService";

function canManagePromoCredits(permissions: string[]): boolean {
  return permissions.includes("usermanage:adjustcredits");
}

export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManagePromoCredits(auth.user.permissions)) {
    return jsonError("Missing required permission: usermanage:adjustcredits", 403);
  }

  const result = await promo.getPromoCreditSettings();
  return jsonResult(result, result.error ? 500 : 200);
}

export async function PUT(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canManagePromoCredits(auth.user.permissions)) {
    return jsonError("Missing required permission: usermanage:adjustcredits", 403);
  }

  const body = (await request.json()) as { welcomeCreditCents?: unknown; welcomeCreditDollars?: unknown };
  const resolved = resolveCreditDeltaCents({
    deltaCents: body.welcomeCreditCents,
    amountDollars: body.welcomeCreditDollars,
  });
  if (typeof resolved === "object") {
    return jsonError("welcomeCreditDollars must be a valid dollar amount", 400);
  }

  const result = await promo.updatePromoCreditSettings({
    welcomeCreditCents: resolved,
    adminId: auth.user.id,
  });
  return jsonResult(result, result.error ? 400 : 200);
}
