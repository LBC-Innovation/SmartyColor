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

  const body = (await request.json()) as {
    welcomeFreeSheets?: unknown;
    friendCreditCents?: unknown;
    friendCreditDollars?: unknown;
    sharerCreditCents?: unknown;
    sharerCreditDollars?: unknown;
  };
  const amount = (cents: unknown, dollars: unknown, field: string): number | undefined | Response => {
    if (cents === undefined && dollars === undefined) return undefined;
    const resolved = resolveCreditDeltaCents({ deltaCents: cents, amountDollars: dollars });
    return typeof resolved === "object" ? jsonError(`${field} must be a valid dollar amount`, 400) : resolved;
  };
  let welcomeFreeSheets: number | undefined;
  if (body.welcomeFreeSheets !== undefined) {
    const sheets = typeof body.welcomeFreeSheets === "string" ? Number(body.welcomeFreeSheets.trim()) : body.welcomeFreeSheets;
    if (typeof sheets !== "number" || !Number.isInteger(sheets)) {
      return jsonError("welcomeFreeSheets must be a whole number", 400);
    }
    welcomeFreeSheets = sheets;
  }
  const friend = amount(body.friendCreditCents, body.friendCreditDollars, "friendCreditDollars");
  if (friend instanceof Response) return friend;
  const sharer = amount(body.sharerCreditCents, body.sharerCreditDollars, "sharerCreditDollars");
  if (sharer instanceof Response) return sharer;

  const result = await promo.updatePromoCreditSettings({
    welcomeFreeSheets,
    friendCreditCents: friend,
    sharerCreditCents: sharer,
    adminId: auth.user.id,
  });
  return jsonResult(result, result.error ? 400 : 200);
}
