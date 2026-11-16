import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { PURCHASE_CODES_PERMISSION } from "@/lib/purchaseCodes/permissions";
import type { CreatePurchaseCodesInput } from "@/lib/purchaseCodes/types";
import { createPurchaseCodes, listPurchaseCodes } from "@/server/purchaseCodesService";

async function admin(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return { error: auth.error } as const;
  if (!auth.user.permissions.includes(PURCHASE_CODES_PERMISSION)) {
    return { error: jsonError(`Missing required permission: ${PURCHASE_CODES_PERMISSION}`, 403) } as const;
  }
  return { user: auth.user } as const;
}

export async function GET(request: Request) {
  const auth = await admin(request);
  if ("error" in auth) return auth.error;
  const result = await listPurchaseCodes();
  return jsonResult(result, result.error ? 500 : 200);
}

export async function POST(request: Request) {
  const auth = await admin(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as Partial<CreatePurchaseCodesInput> | null;
  if (!body) return jsonError("Invalid JSON body", 400);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
  const result = await createPurchaseCodes(
    {
      campaign: str(body.campaign) ?? "",
      quantity: num(body.quantity, 1),
      includedPages: num(body.includedPages, NaN),
      editsPerPage: num(body.editsPerPage, NaN),
      portraitsPerPage: num(body.portraitsPerPage, NaN),
      bindingId: body.bindingId as CreatePurchaseCodesInput["bindingId"],
      backsIncluded: body.backsIncluded !== false,
      shippingLevel: "MAIL",
      maxBookCents: typeof body.maxBookCents === "number" ? body.maxBookCents : null,
      expiresAt: str(body.expiresAt),
      recipientName: str(body.recipientName),
      recipientEmail: str(body.recipientEmail),
      recipientPhone: str(body.recipientPhone),
      note: str(body.note),
    },
    auth.user.id,
  );
  return jsonResult(result, result.error ? 400 : 201);
}
