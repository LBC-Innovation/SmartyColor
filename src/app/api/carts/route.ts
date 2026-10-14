import { jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import type { BookCartInput } from "@/lib/orders/cartTypes";
import * as carts from "@/server/cartsService";

/** Books the user started and hasn't ordered yet, newest first. */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const result = await carts.listCarts(auth.user.id);
  return jsonResult(result, result.error ? 500 : 200);
}

export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as BookCartInput;
  const result = await carts.createCart(auth.user.id, body);
  return jsonResult(result, result.error ? (result.error.code === "INVALID_CART" ? 400 : 500) : 201);
}
