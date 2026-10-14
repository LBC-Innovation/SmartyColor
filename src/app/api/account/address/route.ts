import { jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import type { ShippingAddress } from "@/lib/orders/types";
import * as savedAddress from "@/server/savedAddressService";

export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const result = await savedAddress.getSavedAddress(auth.user.id);
  return jsonResult(result, result.error ? 500 : 200);
}

export async function PUT(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as Partial<ShippingAddress> | null;
  const result = await savedAddress.saveAddress(auth.user.id, body);
  return jsonResult(result, result.error ? (result.error.code === "INVALID_ADDRESS" ? 400 : 500) : 200);
}

export async function DELETE(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const result = await savedAddress.clearSavedAddress(auth.user.id);
  return jsonResult(result, result.error ? 500 : 200);
}
